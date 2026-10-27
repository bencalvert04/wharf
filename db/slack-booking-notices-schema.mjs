export const slackBookingNoticesSchema=[`CREATE TABLE IF NOT EXISTS slack_booking_notices (
 slack_meeting_id text PRIMARY KEY REFERENCES slack_meetings(id) ON DELETE CASCADE,
 text text NOT NULL, sent_at timestamptz, lease_until timestamptz
)`];
