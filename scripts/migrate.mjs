import {pendingMeetingSchema} from '../db/pending-meeting-schema.mjs';
import {neon} from '@neondatabase/serverless';
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL before running migrations.');
const sql=neon(process.env.DATABASE_URL);
await sql`CREATE TABLE IF NOT EXISTS requests (id text PRIMARY KEY, constraints text NOT NULL, created_at text NOT NULL, planner_key text NOT NULL)`;
console.log('Wharf database schema is ready.');
await sql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS owner_session text`;
await sql`CREATE TABLE IF NOT EXISTS sessions(id text PRIMARY KEY, google_sub text, expires_at timestamptz NOT NULL)`;
await sql`CREATE TABLE IF NOT EXISTS oauth_states(id text PRIMARY KEY, session_id text NOT NULL, meeting_id text NOT NULL REFERENCES requests(id) ON DELETE CASCADE, verifier text NOT NULL, nonce text NOT NULL, expires_at timestamptz NOT NULL)`;
await sql`CREATE TABLE IF NOT EXISTS attendees(meeting_id text NOT NULL REFERENCES requests(id) ON DELETE CASCADE, google_sub text NOT NULL, name text NOT NULL, busy jsonb NOT NULL, captured_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(meeting_id,google_sub))`;
await sql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS planner_name text`;
console.log('Calendar schema is ready.');

await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS name text`;
await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS picture text`;
await sql`ALTER TABLE oauth_states ALTER COLUMN meeting_id DROP NOT NULL`;
await sql`ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS return_meeting_id text`;

await sql`CREATE TABLE IF NOT EXISTS google_calendar_connections (
 google_sub text PRIMARY KEY, refresh_token text, version integer NOT NULL DEFAULT 0,
 disconnecting boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
)`;
await sql`ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS expected_sub text`;
await sql`ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS connection_version integer`;
console.log('Persistent calendar connection schema is ready.');

await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS email text`;
await sql`ALTER TABLE attendees ADD COLUMN IF NOT EXISTS email text`;
await sql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS final_time jsonb`;
await sql`CREATE TABLE IF NOT EXISTS invitation_outbox (
 id text PRIMARY KEY, meeting_id text NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
 recipient_key text NOT NULL, payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), first_attempt_at timestamptz,
 lease_until timestamptz, sent_at timestamptz, provider_id text,
 attempts integer NOT NULL DEFAULT 0, last_error text,
 UNIQUE(meeting_id,recipient_key)
)`;

// Serialize attendee changes with finalization, including OAuth callbacks already in flight.
await sql`CREATE OR REPLACE FUNCTION protect_finalized_attendees() RETURNS trigger AS $$
DECLARE finalized jsonb; tracked text;
BEGIN
 SELECT final_time,to_jsonb(requests)->>'agent_request_id' INTO finalized,tracked FROM requests WHERE id=COALESCE(NEW.meeting_id,OLD.meeting_id) FOR UPDATE;
 IF finalized IS NOT NULL AND tracked IS NULL THEN RAISE EXCEPTION 'This meeting has already been finalized.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql`;
await sql`DROP TRIGGER IF EXISTS protect_finalized_attendees ON attendees`;
await sql`CREATE TRIGGER protect_finalized_attendees BEFORE INSERT OR UPDATE OR DELETE ON attendees FOR EACH ROW EXECUTE FUNCTION protect_finalized_attendees()`;
await sql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS agent_request_id text`;
await sql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS agent_input_hash text`;
await sql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0`;
await sql`ALTER TABLE requests ADD COLUMN IF NOT EXISTS final_time jsonb`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS requests_agent_idempotency ON requests(planner_key,agent_request_id) WHERE agent_request_id IS NOT NULL`;
await sql`CREATE TABLE IF NOT EXISTS request_invitees (
 meeting_id text NOT NULL REFERENCES requests(id) ON DELETE CASCADE,id text NOT NULL,
 name text NOT NULL,position integer NOT NULL,token_hash text NOT NULL,
 google_sub text,PRIMARY KEY(meeting_id,id),UNIQUE(meeting_id,google_sub)
)`;
await sql`ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS invitee_id text`;
console.log('Agent workflow schema is ready.');

await sql`CREATE UNIQUE INDEX IF NOT EXISTS requests_agent_key_scope ON requests(planner_key) WHERE agent_request_id IS NOT NULL`;

await sql`ALTER TABLE google_calendar_connections ADD COLUMN IF NOT EXISTS granted_scopes text`;
await sql`ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'join'`;
await sql`CREATE TABLE IF NOT EXISTS google_meeting_events (
 meeting_id text PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
 organizer_sub text NOT NULL, event_id text NOT NULL, payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz,
 html_link text, lease_until timestamptz, last_error text
)`;
console.log('Native Google Calendar invitation schema is ready.');

await sql`CREATE TABLE IF NOT EXISTS agent_calendar_authorizations (
 meeting_id text PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
 participant_id text NOT NULL, token_hash text NOT NULL,
 authorized_sub text, authorized_at timestamptz,
 FOREIGN KEY(meeting_id,participant_id) REFERENCES request_invitees(meeting_id,id) ON DELETE CASCADE
)`;
console.log('Agent calendar authorization schema is ready.');

// Slack transport records contain encrypted meeting keys, never Google tokens.
await sql`CREATE TABLE IF NOT EXISTS slack_meetings (
 id text PRIMARY KEY,team_id text NOT NULL,channel_id text NOT NULL,thread_ts text NOT NULL,
 organizer_id text NOT NULL,draft jsonb NOT NULL,meeting_id text,key_cipher text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(team_id,channel_id,thread_ts)
)`;
await sql`CREATE TABLE IF NOT EXISTS slack_jobs (
 id text PRIMARY KEY,payload jsonb NOT NULL,status text NOT NULL DEFAULT 'pending',
 created_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,attempts integer NOT NULL DEFAULT 0
)`;
console.log('Slack bot schema is ready.');

for(const statement of pendingMeetingSchema)await sql.query(statement);
console.log('Pending meeting activity and retained membership schema is ready.');

await sql`CREATE TABLE IF NOT EXISTS slack_context (
 team_id text NOT NULL,channel_id text NOT NULL,thread_ts text NOT NULL,user_id text NOT NULL,
 messages jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(team_id,channel_id,thread_ts,user_id)
)`;
console.log('Slack conversation context schema is ready.');

const {slackAttendanceSchema}=await import('../db/slack-attendance-schema.mjs');
for(const statement of slackAttendanceSchema)await sql.query(statement);
console.log('Slack attendance schema is ready.');

await sql`ALTER TABLE slack_meetings ADD COLUMN IF NOT EXISTS pending_booking boolean NOT NULL DEFAULT false`;
await sql`ALTER TABLE slack_meetings ADD COLUMN IF NOT EXISTS invitation_ts text`;

await sql`ALTER TABLE slack_meetings ADD COLUMN IF NOT EXISTS ready_notified boolean NOT NULL DEFAULT false`;
