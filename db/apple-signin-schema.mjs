export const appleSigninSchema=[
 `CREATE TABLE IF NOT EXISTS apple_signin_states (
 id text PRIMARY KEY,session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 binding_hash text NOT NULL,nonce text NOT NULL,return_meeting_id text,
 calendar_intent jsonb NOT NULL,expires_at timestamptz NOT NULL
 )`,
 `CREATE INDEX IF NOT EXISTS apple_signin_states_expiry ON apple_signin_states(expires_at)`,
 `CREATE TABLE IF NOT EXISTS apple_accounts (
 account_id text PRIMARY KEY,name text NOT NULL,email text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
 )`,
];
