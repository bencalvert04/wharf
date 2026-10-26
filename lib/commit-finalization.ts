import {randomUUID} from 'node:crypto';
import {sql,hash,appUrl,meeting} from './auth';
import {invitationEmail} from './calendar-invitation';
import type {Participant} from './finalization';
import type {Constraints} from './availability';

/** Atomically freeze the selected time and queue recipients against the validated snapshot. */
export async function commitFinalization(id:string,c:Constraints,people:Participant[],start:number,end:number){
 people=[...people].sort((a,b)=>a.google_sub<b.google_sub?-1:a.google_sub>b.google_sub?1:0);
 const [planner]=await sql()`SELECT COALESCE(r.planner_name,s.name) AS name FROM requests r LEFT JOIN sessions s ON s.id=r.owner_session WHERE r.id=${id}`;
 const final=JSON.stringify({start,end}),snapshot=JSON.stringify(people),db=sql();
   const recipients=[...new Map(people.map(p=>[p.email!.toLowerCase(),p])).values()];
   const results=await db.transaction([
    db`SELECT id FROM requests WHERE id=${id} FOR UPDATE`,
    db`UPDATE requests SET final_time=${final}::jsonb WHERE id=${id} AND final_time IS NULL
     AND (SELECT COALESCE(jsonb_agg(jsonb_build_object('google_sub',google_sub,'name',name,'email',email,'busy',busy) ORDER BY google_sub),'[]'::jsonb) FROM attendees WHERE meeting_id=${id})=${snapshot}::jsonb RETURNING id`,
    ...recipients.map(p=>{
     const payload=invitationEmail({id,title:c.title,start,end,createdAt:Date.now(),organizer:process.env.INVITATION_FROM!,zone:c.zone,plannerName:planner?.name,recipient:{name:p.name,email:p.email!},url:appUrl()+'/?meeting='+encodeURIComponent(id)});
     return db`INSERT INTO invitation_outbox(id,meeting_id,recipient_key,payload)
      SELECT ${randomUUID()},${id},${hash(p.email!.toLowerCase())},${JSON.stringify(payload)}::jsonb
      WHERE EXISTS(SELECT 1 FROM requests WHERE id=${id} AND final_time=${final}::jsonb AND (SELECT COALESCE(jsonb_agg(jsonb_build_object('google_sub',google_sub,'name',name,'email',email,'busy',busy) ORDER BY google_sub),'[]'::jsonb) FROM attendees WHERE meeting_id=${id})=${snapshot}::jsonb)
      ON CONFLICT(meeting_id,recipient_key) DO NOTHING`;
    })
   ]);
   if(!results[1].length){const current=await meeting(id);if(current?.final_time?.start!==start||current?.final_time?.end!==end)return false}
 return true;
}
