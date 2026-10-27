export const slackAttendanceSchema = [
 `CREATE TABLE IF NOT EXISTS slack_google_accounts (
 team_id text NOT NULL,user_id text NOT NULL,session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 google_sub text NOT NULL,PRIMARY KEY(team_id,user_id))`,
 `CREATE TABLE IF NOT EXISTS slack_attendance_links (
 id text PRIMARY KEY,team_id text NOT NULL,user_id text NOT NULL,slack_meeting_id text NOT NULL REFERENCES slack_meetings(id) ON DELETE CASCADE,
 session_id text,expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',completed_at timestamptz)`,
 `ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS slack_attendance_id text`
];
