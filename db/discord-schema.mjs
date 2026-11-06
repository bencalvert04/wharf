export const discordSchema=[`CREATE TABLE IF NOT EXISTS discord_components (
 id text PRIMARY KEY,team_id text NOT NULL,channel_id text NOT NULL,user_id text,
 action text NOT NULL,value text NOT NULL,participants jsonb NOT NULL DEFAULT '[]',timezone text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days'
)`];
