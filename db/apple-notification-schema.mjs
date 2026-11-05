// Apply before enabling the notification endpoint or updated Apple callback.
export const appleNotificationSchema=[
 `ALTER TABLE apple_signin_states ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()`,
 `ALTER TABLE apple_accounts ADD COLUMN IF NOT EXISTS authenticated_at timestamptz NOT NULL DEFAULT '-infinity'`,
 `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS apple_authenticated_at timestamptz`,
 `CREATE TABLE IF NOT EXISTS apple_notification_receipts(id text PRIMARY KEY,received_at timestamptz NOT NULL DEFAULT now())`,
 `CREATE TABLE IF NOT EXISTS apple_email_preferences(email_hash text PRIMARY KEY,enabled boolean NOT NULL,event_time bigint NOT NULL)`,
 `CREATE OR REPLACE FUNCTION wharf_apply_apple_notification(event_id text,account text,event_type text,event_time bigint,event_email text DEFAULT NULL) RETURNS boolean AS $$
 DECLARE seq bigint; marker text; signed_in timestamptz; affected integer;
 BEGIN
  IF event_id!~'^[a-f0-9]{64}$' OR account NOT LIKE 'apple:%' OR event_type NOT IN ('consent-revoked','account-deleted','email-enabled','email-disabled') OR event_time<=0 THEN RAISE EXCEPTION 'Invalid Apple notification'; END IF;
  -- Same lock as login/provider persistence: a callback cannot commit between
  -- the account tombstone and session invalidation.
  PERFORM pg_advisory_xact_lock(1794083);
  INSERT INTO apple_notification_receipts(id) VALUES(event_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected=0 THEN RETURN false; END IF;
  IF event_type IN ('email-enabled','email-disabled') THEN
   IF event_email IS NULL OR event_email NOT LIKE '%@privaterelay.appleid.com' THEN RAISE EXCEPTION 'Invalid Apple relay notification'; END IF;
   INSERT INTO apple_email_preferences(email_hash,enabled,event_time)
    VALUES(encode(sha256(convert_to(lower(event_email),'UTF8')),'hex'),event_type='email-enabled',event_time)
    ON CONFLICT(email_hash) DO UPDATE SET enabled=EXCLUDED.enabled,event_time=EXCLUDED.event_time
     WHERE EXCLUDED.event_time>apple_email_preferences.event_time OR (EXCLUDED.event_time=apple_email_preferences.event_time AND NOT EXCLUDED.enabled);
   RETURN true;
  END IF;
  SELECT authenticated_at INTO signed_in FROM apple_accounts WHERE account_id=account;
  IF signed_in IS NULL OR date_trunc('second',signed_in)<=to_timestamp(event_time) THEN
   seq=nextval('calendar_intent_sequence');
   marker=encode(sha256(convert_to('wharf-calendar-intent:'||account,'UTF8')),'hex');
   INSERT INTO calendar_account_intents(account_id,sequence,expires_at) VALUES(marker,seq,clock_timestamp()+interval '15 minutes')
    ON CONFLICT(account_id) DO UPDATE SET sequence=EXCLUDED.sequence,expires_at=GREATEST(calendar_account_intents.expires_at,EXCLUDED.expires_at);
  END IF;
  DELETE FROM apple_signin_states WHERE session_id IN (SELECT id FROM sessions WHERE google_sub=account AND (apple_authenticated_at IS NULL OR date_trunc('second',apple_authenticated_at)<=to_timestamp(event_time)));
  UPDATE sessions SET google_sub=NULL,name=NULL,email=NULL,picture=NULL,apple_authenticated_at=NULL,calendar_intent=nextval('calendar_intent_sequence')
   WHERE google_sub=account AND (apple_authenticated_at IS NULL OR date_trunc('second',apple_authenticated_at)<=to_timestamp(event_time));
  IF event_type='account-deleted' THEN
   DELETE FROM apple_accounts WHERE account_id=account AND date_trunc('second',authenticated_at)<=to_timestamp(event_time);
  END IF;
  RETURN true;
 END; $$ LANGUAGE plpgsql`,
];
