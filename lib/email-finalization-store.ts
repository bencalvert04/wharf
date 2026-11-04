import {randomUUID,createHash} from 'node:crypto';
import type {CalendarDatabase} from './calendar-connection-store.ts';
import type {Participant} from './finalization.ts';
export async function freezeEmailMeeting(db:CalendarDatabase,id:string,people:Participant[],start:number,end:number,recipients:{email:string;payload:unknown}[]){
 const final=JSON.stringify({start,end});
 // Match PostgreSQL ORDER BY google_sub with the caller's deterministic ASCII sort.
 const ordered=JSON.stringify([...people].sort((a,b)=>a.google_sub<b.google_sub?-1:a.google_sub>b.google_sub?1:0));
 const results=await db.transaction([
  db`SELECT id FROM requests WHERE id=${id} FOR UPDATE`,
  db`UPDATE requests SET final_time=${final}::jsonb,revision=revision+1 WHERE id=${id} AND final_time IS NULL
   AND NOT EXISTS(SELECT 1 FROM google_meeting_events WHERE meeting_id=${id})
   AND (SELECT COALESCE(jsonb_agg(jsonb_build_object('google_sub',google_sub,'name',name,'email',email,'busy',busy) ORDER BY google_sub),'[]'::jsonb) FROM attendees WHERE meeting_id=${id})=${ordered}::jsonb RETURNING id`,
  ...recipients.map(({email,payload})=>db`INSERT INTO invitation_outbox(id,meeting_id,recipient_key,payload)
   SELECT ${randomUUID()},${id},${createHash('sha256').update(email.toLowerCase()).digest('hex')},${JSON.stringify(payload)}::jsonb
   WHERE NOT EXISTS(SELECT 1 FROM google_meeting_events WHERE meeting_id=${id})
   AND EXISTS(SELECT 1 FROM requests WHERE id=${id} AND final_time=${final}::jsonb
    AND (SELECT COALESCE(jsonb_agg(jsonb_build_object('google_sub',google_sub,'name',name,'email',email,'busy',busy) ORDER BY google_sub),'[]'::jsonb) FROM attendees WHERE meeting_id=${id})=${ordered}::jsonb)
   ON CONFLICT(meeting_id,recipient_key) DO NOTHING`)
 ]);
 return !!results[1].length;
}
