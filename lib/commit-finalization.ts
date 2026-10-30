import {sql,appUrl} from './auth';
import {invitationEmail} from './calendar-invitation';
import {freezeEmailMeeting} from './email-finalization-store';
import type {Participant} from './finalization';
import type {Constraints} from './availability';

/** Atomically freeze the selected time and queue recipients against the validated snapshot. */
export async function commitFinalization(id:string,c:Constraints,people:Participant[],start:number,end:number){
 const [planner]=await sql()`SELECT COALESCE(r.planner_name,s.name) AS name FROM requests r LEFT JOIN sessions s ON s.id=r.owner_session WHERE r.id=${id}`;
 const recipients=[...new Map(people.map(p=>[p.email!.toLowerCase(),p])).values()].map(p=>({email:p.email!,payload:invitationEmail({id,title:c.title,start,end,createdAt:Date.now(),organizer:process.env.INVITATION_FROM!,zone:c.zone,plannerName:planner?.name,recipient:{name:p.name,email:p.email!},url:appUrl()+'/?meeting='+encodeURIComponent(id)})}));
 return freezeEmailMeeting(sql(),id,people,start,end,recipients);
}
