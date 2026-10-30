// Identity columns named google_sub are legacy Wharf account keys. New identities are namespaced.
export const calendarProviderSchema=[
 `CREATE TABLE IF NOT EXISTS calendar_provider_connections (
 account_id text PRIMARY KEY, provider text NOT NULL CHECK(provider IN ('microsoft','icloud')),
 credential text, email text, connection_id uuid NOT NULL DEFAULT gen_random_uuid(),
 updated_at timestamptz NOT NULL DEFAULT now()
 )`,
 `CREATE TABLE IF NOT EXISTS calendar_provider_states (
 id text PRIMARY KEY, session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 expected_account text, connection_id uuid, meeting_id text REFERENCES requests(id) ON DELETE CASCADE,
 return_meeting_id text, invitee_id text, verifier text NOT NULL,
 expires_at timestamptz NOT NULL
 )`,
];
