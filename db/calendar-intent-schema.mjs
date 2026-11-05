// Additive rollout: deploy this schema before the matching application. In-flight
// OAuth states without an intent are rejected; users restart the connection flow.
export const calendarIntentSchema=[
 `CREATE SEQUENCE IF NOT EXISTS calendar_intent_sequence`,
 `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS calendar_intent bigint NOT NULL DEFAULT 0`,
 `ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS calendar_intent jsonb`,
 `ALTER TABLE calendar_provider_states ADD COLUMN IF NOT EXISTS calendar_intent jsonb`,
 `CREATE TABLE IF NOT EXISTS calendar_account_intents(account_id text PRIMARY KEY,sequence bigint NOT NULL,expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 minutes')`,
 `ALTER TABLE calendar_account_intents ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 minutes'`,
 `CREATE INDEX IF NOT EXISTS calendar_account_intents_expiry ON calendar_account_intents(expires_at)`,
 `CREATE OR REPLACE FUNCTION wharf_cleanup_calendar_intents() RETURNS bigint AS $$
 DECLARE removed bigint;
 BEGIN
  PERFORM pg_advisory_xact_lock(1794083);
  DELETE FROM calendar_account_intents WHERE expires_at<=clock_timestamp();
  GET DIAGNOSTICS removed=ROW_COUNT;
  RETURN removed;
 END; $$ LANGUAGE plpgsql`,
 `CREATE OR REPLACE FUNCTION wharf_assert_calendar_intent(intent jsonb) RETURNS boolean AS $$
 DECLARE item jsonb; actual bigint;
 BEGIN
  PERFORM pg_advisory_xact_lock(1794083);
  IF intent IS NULL OR jsonb_typeof(intent) IS DISTINCT FROM 'object' OR jsonb_typeof(intent->'accounts') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Calendar flow expired'; END IF;
  IF jsonb_typeof(intent->'expiresAt') IS DISTINCT FROM 'string' OR (intent->>'expiresAt')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'Calendar intent expired'; END IF;
  IF intent->>'sessionId' IS NOT NULL THEN
   IF jsonb_typeof(intent->'sessionId') IS DISTINCT FROM 'string' OR length(intent->>'sessionId')=0 OR COALESCE(intent->>'sequence','')!~'^[1-9][0-9]*$' THEN RAISE EXCEPTION 'Invalid calendar session intent'; END IF;
   SELECT calendar_intent INTO actual FROM sessions WHERE id=intent->>'sessionId' AND expires_at>now() FOR UPDATE;
   IF actual IS DISTINCT FROM (intent->>'sequence')::bigint THEN RAISE EXCEPTION 'Calendar flow changed'; END IF;
  END IF;
  IF intent->>'sessionId' IS NULL AND (intent->>'sequence' IS NOT NULL OR jsonb_array_length(intent->'accounts')=0) THEN RAISE EXCEPTION 'Invalid calendar account intent'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(intent->'accounts') LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR COALESCE(item->>'account','')!~'^[a-f0-9]{64}$' OR COALESCE(item->>'sequence','')!~'^[0-9]+$' THEN RAISE EXCEPTION 'Invalid calendar account intent'; END IF;
   SELECT sequence INTO actual FROM calendar_account_intents WHERE account_id=item->>'account';
   IF actual IS DISTINCT FROM (item->>'sequence')::bigint THEN RAISE EXCEPTION 'Calendar account changed'; END IF;
  END LOOP;
  RETURN true;
 END; $$ LANGUAGE plpgsql`,
 `CREATE OR REPLACE FUNCTION wharf_begin_calendar_intent(session_id text,expected_account text,check_expected boolean,account_wide boolean) RETURNS jsonb AS $$
 DECLARE account text; seq bigint; active text; accounts jsonb='[]'::jsonb;
 BEGIN
  PERFORM pg_advisory_xact_lock(1794083);
  PERFORM wharf_cleanup_calendar_intents();
  SELECT id,google_sub INTO active,account FROM sessions WHERE id=session_id AND expires_at>now() FOR UPDATE;
  IF active IS NULL OR (check_expected AND account IS DISTINCT FROM expected_account) THEN RAISE EXCEPTION 'Calendar session changed'; END IF;
  seq=nextval('calendar_intent_sequence');
  UPDATE sessions SET calendar_intent=seq WHERE id=session_id;
  IF account_wide AND account IS NOT NULL THEN
   account=encode(sha256(convert_to('wharf-calendar-intent:'||account,'UTF8')),'hex');
   INSERT INTO calendar_account_intents(account_id,sequence,expires_at) VALUES(account,seq,clock_timestamp()+interval '15 minutes') ON CONFLICT(account_id) DO UPDATE SET sequence=EXCLUDED.sequence,expires_at=GREATEST(calendar_account_intents.expires_at,EXCLUDED.expires_at);
   accounts=jsonb_build_array(jsonb_build_object('account',account,'sequence',seq::text));
  END IF;
  RETURN jsonb_build_object('sessionId',session_id,'sequence',seq::text,'accounts',accounts,'expiresAt',clock_timestamp()+interval '10 minutes');
 END; $$ LANGUAGE plpgsql`,
 `CREATE OR REPLACE FUNCTION wharf_bind_calendar_account(intent jsonb,account text) RETURNS jsonb AS $$
 DECLARE actual bigint; seq bigint=(intent->>'sequence')::bigint;
 BEGIN
  PERFORM wharf_assert_calendar_intent(intent);
  IF intent->>'sessionId' IS NULL OR account IS NULL OR seq IS NULL THEN RAISE EXCEPTION 'Invalid calendar identity'; END IF;
  account=encode(sha256(convert_to('wharf-calendar-intent:'||account,'UTF8')),'hex');
  SELECT sequence INTO actual FROM calendar_account_intents WHERE account_id=account;
  IF actual>seq THEN RAISE EXCEPTION 'A newer calendar action superseded this connection'; END IF;
  INSERT INTO calendar_account_intents(account_id,sequence,expires_at) VALUES(account,seq,GREATEST(clock_timestamp()+interval '15 minutes',(intent->>'expiresAt')::timestamptz+interval '5 minutes')) ON CONFLICT(account_id) DO UPDATE SET sequence=EXCLUDED.sequence,expires_at=GREATEST(calendar_account_intents.expires_at,EXCLUDED.expires_at);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(intent->'accounts') item WHERE item->>'account'=account) THEN
   intent=jsonb_set(intent,'{accounts}',(intent->'accounts')||jsonb_build_array(jsonb_build_object('account',account,'sequence',seq::text)));
  END IF;
  RETURN intent;
 END; $$ LANGUAGE plpgsql`,
 `CREATE OR REPLACE FUNCTION wharf_capture_calendar_account(account text) RETURNS jsonb AS $$
 DECLARE seq bigint;
 BEGIN
  PERFORM pg_advisory_xact_lock(1794083);
  PERFORM wharf_cleanup_calendar_intents();
  IF account IS NULL OR length(account)=0 THEN RAISE EXCEPTION 'Invalid calendar identity'; END IF;
  account=encode(sha256(convert_to('wharf-calendar-intent:'||account,'UTF8')),'hex');
  INSERT INTO calendar_account_intents(account_id,sequence,expires_at) VALUES(account,0,clock_timestamp()+interval '15 minutes') ON CONFLICT(account_id) DO UPDATE SET expires_at=GREATEST(calendar_account_intents.expires_at,EXCLUDED.expires_at);
  SELECT sequence INTO seq FROM calendar_account_intents WHERE account_id=account;
  RETURN jsonb_build_object('sessionId',NULL,'sequence',NULL,'accounts',jsonb_build_array(jsonb_build_object('account',account,'sequence',seq::text)),'expiresAt',clock_timestamp()+interval '10 minutes');
 END; $$ LANGUAGE plpgsql`,
 `CREATE OR REPLACE FUNCTION wharf_capture_calendar_session(session_id text,account text) RETURNS jsonb AS $$
 DECLARE seq bigint; active text; intent jsonb;
 BEGIN
  PERFORM pg_advisory_xact_lock(1794083);
  SELECT id,calendar_intent INTO active,seq FROM sessions WHERE id=session_id AND google_sub=account AND expires_at>now() FOR UPDATE;
  IF active IS NULL THEN RAISE EXCEPTION 'Calendar session changed'; END IF;
  IF seq=0 THEN seq=nextval('calendar_intent_sequence');UPDATE sessions SET calendar_intent=seq WHERE id=session_id; END IF;
  intent=wharf_capture_calendar_account(account);
  RETURN intent||jsonb_build_object('sessionId',session_id,'sequence',seq::text);
 END; $$ LANGUAGE plpgsql`,
];
