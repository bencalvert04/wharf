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
