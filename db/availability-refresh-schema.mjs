export const availabilityRefreshSchema=[
 `CREATE TABLE IF NOT EXISTS meeting_availability_refresh (
 meeting_id text PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
 lease_id text,lease_until timestamptz,last_attempt_at timestamptz,
 attempted_revision integer,last_checked_at timestamptz,last_error text
 )`
];
