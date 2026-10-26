// Shared with the migration and embedded-PostgreSQL tests. No user-supplied SQL.
export const pendingMeetingSchema=[
 `ALTER TABLE requests ADD COLUMN IF NOT EXISTS last_activity_at timestamptz`,
 `UPDATE requests r SET last_activity_at=GREATEST(r.created_at::timestamptz,COALESCE((SELECT max(a.captured_at) FROM attendees a WHERE a.meeting_id=r.id),r.created_at::timestamptz)) WHERE r.last_activity_at IS NULL`,
 `ALTER TABLE requests ALTER COLUMN last_activity_at SET DEFAULT now()`,
 `ALTER TABLE requests ALTER COLUMN last_activity_at SET NOT NULL`,
 `CREATE TABLE IF NOT EXISTS meeting_memberships (
  meeting_id text NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  google_sub text NOT NULL,name text NOT NULL,invitee_id text,
  last_participated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(meeting_id,google_sub)
 )`,
 `CREATE TABLE IF NOT EXISTS pending_meeting_dismissals (
  meeting_id text NOT NULL REFERENCES requests(id) ON DELETE CASCADE,identity_key text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(meeting_id,identity_key)
 )`,
 `CREATE INDEX IF NOT EXISTS pending_dismissal_identity_idx ON pending_meeting_dismissals(identity_key,meeting_id)`,
 `CREATE INDEX IF NOT EXISTS membership_google_sub_idx ON meeting_memberships(google_sub,meeting_id)`,
 `INSERT INTO meeting_memberships(meeting_id,google_sub,name,invitee_id,last_participated_at)
 SELECT a.meeting_id,a.google_sub,a.name,i.id,a.captured_at FROM attendees a LEFT JOIN request_invitees i ON i.meeting_id=a.meeting_id AND i.google_sub=a.google_sub
 ON CONFLICT(meeting_id,google_sub) DO NOTHING`,
 `CREATE OR REPLACE FUNCTION remember_meeting_participation() RETURNS trigger AS $$
 DECLARE mid text; sub text; display_name text; invitation_id text;
 BEGIN
  IF TG_OP='DELETE' THEN mid:=OLD.meeting_id;sub:=OLD.google_sub;display_name:=OLD.name;
  ELSE mid:=NEW.meeting_id;sub:=NEW.google_sub;display_name:=NEW.name; END IF;
  IF NOT EXISTS(SELECT 1 FROM requests WHERE id=mid) THEN RETURN NULL; END IF;
  SELECT id INTO invitation_id FROM request_invitees WHERE meeting_id=mid AND google_sub=sub;
  INSERT INTO meeting_memberships(meeting_id,google_sub,name,invitee_id)
   VALUES(mid,sub,display_name,invitation_id)
   ON CONFLICT(meeting_id,google_sub) DO UPDATE SET name=EXCLUDED.name,invitee_id=COALESCE(EXCLUDED.invitee_id,meeting_memberships.invitee_id),last_participated_at=now();
  IF TG_OP!='DELETE' THEN DELETE FROM pending_meeting_dismissals WHERE meeting_id=mid AND identity_key='google:'||sub; END IF;
  UPDATE requests SET last_activity_at=now() WHERE id=mid;
  RETURN NULL;
 END; $$ LANGUAGE plpgsql`,
 `DROP TRIGGER IF EXISTS remember_meeting_participation ON attendees`,
 `CREATE TRIGGER remember_meeting_participation AFTER INSERT OR UPDATE OR DELETE ON attendees FOR EACH ROW EXECUTE FUNCTION remember_meeting_participation()`,
 `CREATE OR REPLACE FUNCTION remember_meeting_invitee() RETURNS trigger AS $$
 BEGIN
  IF NEW.google_sub IS NOT NULL THEN
   UPDATE meeting_memberships SET invitee_id=NEW.id WHERE meeting_id=NEW.meeting_id AND google_sub=NEW.google_sub;
  END IF;
  RETURN NULL;
 END; $$ LANGUAGE plpgsql`,
 `DROP TRIGGER IF EXISTS remember_meeting_invitee ON request_invitees`,
 `CREATE TRIGGER remember_meeting_invitee AFTER INSERT OR UPDATE OF google_sub ON request_invitees FOR EACH ROW EXECUTE FUNCTION remember_meeting_invitee()`,
 `CREATE OR REPLACE FUNCTION record_meeting_change() RETURNS trigger AS $$
 BEGIN
  IF NEW.constraints IS DISTINCT FROM OLD.constraints OR NEW.final_time IS DISTINCT FROM OLD.final_time OR NEW.revision IS DISTINCT FROM OLD.revision THEN NEW.last_activity_at:=now(); END IF;
  RETURN NEW;
 END; $$ LANGUAGE plpgsql`,
 `DROP TRIGGER IF EXISTS record_meeting_change ON requests`,
 `CREATE TRIGGER record_meeting_change BEFORE UPDATE OF constraints,final_time,revision ON requests FOR EACH ROW EXECUTE FUNCTION record_meeting_change()`
];
