export const slackInstallationsSchema=[
 `CREATE TABLE IF NOT EXISTS slack_installations (
 team_id text PRIMARY KEY,team_name text NOT NULL,bot_user_id text NOT NULL,
 bot_token_cipher text,scopes text NOT NULL,installed_by text NOT NULL,
 installed_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz
 )`,
 `CREATE TABLE IF NOT EXISTS slack_install_states (
 id text PRIMARY KEY,browser_hash text NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
 )`,
 `CREATE INDEX IF NOT EXISTS slack_install_states_expiry ON slack_install_states(expires_at)`
];
