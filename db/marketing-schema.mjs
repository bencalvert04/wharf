// No identities, meeting IDs, titles, emails, URLs, or calendar contents.
export const marketingSchema=[
`CREATE TABLE IF NOT EXISTS marketing_events(id text PRIMARY KEY,visit text NOT NULL,event text NOT NULL,view text NOT NULL,source text NOT NULL,medium text NOT NULL,campaign text NOT NULL,content text NOT NULL,device text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`,
`CREATE INDEX IF NOT EXISTS marketing_events_visit ON marketing_events(visit)`,
`CREATE INDEX IF NOT EXISTS marketing_events_time ON marketing_events(created_at)`,
`CREATE TABLE IF NOT EXISTS marketing_daily(day date NOT NULL,metric text NOT NULL,value bigint NOT NULL DEFAULT 0,PRIMARY KEY(day,metric))`,
`CREATE OR REPLACE FUNCTION wharf_marketing_count() RETURNS trigger AS $$
DECLARE metric_name text; c jsonb;
BEGIN
 IF TG_TABLE_NAME='requests' THEN
  c=NEW.constraints::jsonb;
  IF COALESCE((c->>'demo')::boolean,false) THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN metric_name='meetings_created';
  ELSIF OLD.final_time IS NULL AND NEW.final_time IS NOT NULL THEN metric_name='meetings_finalized';
  ELSE RETURN NEW; END IF;
 ELSE
  SELECT constraints::jsonb INTO c FROM requests WHERE id=NEW.meeting_id;
  IF COALESCE((c->>'demo')::boolean,false) THEN RETURN NEW; END IF;
  metric_name=CASE WHEN NEW.google_sub LIKE 'manual:%' THEN 'manual_joins' WHEN NEW.google_sub LIKE 'microsoft:%' THEN 'microsoft_joins' ELSE 'calendar_joins' END;
 END IF;
 INSERT INTO marketing_daily(day,metric,value) VALUES((now() AT TIME ZONE 'UTC')::date,metric_name,1)
 ON CONFLICT(day,metric) DO UPDATE SET value=marketing_daily.value+1;
 RETURN NEW;
END; $$ LANGUAGE plpgsql`,
`DROP TRIGGER IF EXISTS wharf_marketing_requests ON requests`,
`CREATE TRIGGER wharf_marketing_requests AFTER INSERT OR UPDATE OF final_time ON requests FOR EACH ROW EXECUTE FUNCTION wharf_marketing_count()`,
`DROP TRIGGER IF EXISTS wharf_marketing_attendees ON attendees`,
`CREATE TRIGGER wharf_marketing_attendees AFTER INSERT ON attendees FOR EACH ROW EXECUTE FUNCTION wharf_marketing_count()`
];
