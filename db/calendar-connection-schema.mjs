// A fresh connection must never accept an OAuth callback from a deleted connection,
// even when its numeric version starts over. Existing flows fail closed and can retry.
export const calendarConnectionSchema=[
 `ALTER TABLE google_calendar_connections ADD COLUMN IF NOT EXISTS connection_id uuid NOT NULL DEFAULT gen_random_uuid()`,
 `ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS connection_id uuid`,
];
