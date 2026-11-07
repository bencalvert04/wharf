import type {CalendarDatabase} from './calendar-connection-store.ts';
export async function claimMeetingRefresh(db:CalendarDatabase,id:string,lease:string,force=false){
 await db`INSERT INTO meeting_availability_refresh(meeting_id) SELECT id FROM requests WHERE id=${id} AND final_time IS NULL ON CONFLICT DO NOTHING`;
 const [claim]=await db`UPDATE meeting_availability_refresh f SET lease_id=${lease},lease_until=now()+interval '90 seconds',last_attempt_at=now(),attempted_revision=r.revision
 FROM requests r WHERE f.meeting_id=${id} AND r.id=f.meeting_id AND r.final_time IS NULL
 AND (f.lease_until IS NULL OR f.lease_until<now())
 AND (${force} OR f.last_attempt_at IS NULL OR f.last_attempt_at<now()-interval '2 minutes' OR f.attempted_revision IS DISTINCT FROM r.revision)
 RETURNING r.revision,r.constraints`;
 return claim;
}
export async function saveMeetingRefresh(db:CalendarDatabase,id:string,lease:string,revision:number,snapshots:{sub:string;busy:unknown}[]){
 // Suppress participation/activity triggers only inside this short transaction.
 // The generation guard from sql() also protects every account in this batch.
 const results=await db.transaction([
  db`SELECT set_config('wharf.availability_refresh','on',true)`,
  db`WITH changed AS (
   UPDATE requests r SET revision=revision+1 WHERE r.id=${id} AND r.revision=${revision} AND r.final_time IS NULL
   AND EXISTS(SELECT 1 FROM meeting_availability_refresh f WHERE f.meeting_id=r.id AND f.lease_id=${lease} AND f.lease_until>now()) RETURNING id,revision
  ), updated AS (
   UPDATE attendees a SET busy=p->'busy',captured_at=now() FROM changed,jsonb_array_elements(${JSON.stringify(snapshots)}::jsonb) p
   WHERE a.meeting_id=changed.id AND a.google_sub=p->>'sub' RETURNING a.google_sub
  ) UPDATE meeting_availability_refresh f SET lease_id=NULL,lease_until=NULL,last_checked_at=now(),last_error=NULL,attempted_revision=changed.revision
    FROM changed WHERE f.meeting_id=changed.id RETURNING f.last_checked_at`
 ]);
 return results[1][0];
}
export async function failMeetingRefresh(db:CalendarDatabase,id:string,lease:string,error:string){
 await db`UPDATE meeting_availability_refresh SET lease_id=NULL,lease_until=NULL,last_error=${error} WHERE meeting_id=${id} AND lease_id=${lease}`;
}
