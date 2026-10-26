import {sql,appUrl,meeting} from './auth';
import {calendarConnection} from './calendar-connection';
import {google} from './google';
import {openToken} from './token-vault';
import {needsCalendarConsent} from './calendar-access';
import {grantHasEventWrite,googleEventPayload,createOrRecoverGoogleEvent,type GoogleEventPayload,type EventTransport} from './google-event-payload';
import type {Constraints} from './availability';
import type {Participant} from './finalization';
export class CalendarPermissionRequired extends Error{constructor(){super('Allow Google Calendar invitations to create this meeting.')}}
export async function eventConnection(sub:string){const connection=await calendarConnection(sub);if(!connection?.refresh_token||connection.disconnecting||!grantHasEventWrite(connection.granted_scopes))throw new CalendarPermissionRequired();return connection}
export async function googleMeetingEvent(id:string){const [row]=await sql()`SELECT * FROM google_meeting_events WHERE meeting_id=${id}`;return row||null}
export function calendarStatus(row:any){return row?{status:row.delivered_at?'created':'pending',htmlLink:row.html_link||null,error:row.last_error||null}:null}
/** Freeze time and the full guest list together. Retries reuse this immutable payload. */
export async function commitGoogleFinalization(id:string,c:Constraints,people:Participant[],start:number,end:number,sub:string,email:string){
 people=[...people].sort((a,b)=>a.google_sub<b.google_sub?-1:a.google_sub>b.google_sub?1:0);
 const payload=googleEventPayload({id,title:c.title,start,end,zone:c.zone,organizerSub:sub,organizerEmail:email,attendees:people.map(p=>({name:p.name,email:p.email!})),url:appUrl()+'/?meeting='+encodeURIComponent(id)});
 const snapshot=JSON.stringify(people),final=JSON.stringify({start,end}),db=sql();
 const results=await db.transaction([
  db`SELECT id FROM requests WHERE id=${id} FOR UPDATE`,
  db`UPDATE requests SET final_time=${final}::jsonb,revision=revision+1 WHERE id=${id} AND final_time IS NULL AND (agent_request_id IS NULL OR constraints::jsonb->>'openJoin'='true')
   AND (SELECT COALESCE(jsonb_agg(jsonb_build_object('google_sub',google_sub,'name',name,'email',email,'busy',busy) ORDER BY google_sub),'[]'::jsonb) FROM attendees WHERE meeting_id=${id})=${snapshot}::jsonb RETURNING id`,
  db`INSERT INTO google_meeting_events(meeting_id,organizer_sub,event_id,payload)
   SELECT ${id},${sub},${payload.id},${JSON.stringify(payload)}::jsonb
   WHERE EXISTS(SELECT 1 FROM requests WHERE id=${id} AND final_time=${final}::jsonb AND (agent_request_id IS NULL OR constraints::jsonb->>'openJoin'='true'))
   AND NOT EXISTS(SELECT 1 FROM invitation_outbox WHERE meeting_id=${id})
   ON CONFLICT(meeting_id) DO NOTHING`
 ]);
 const job=await googleMeetingEvent(id),current=await meeting(id);
 return !!job&&current?.final_time?.start===start&&current?.final_time?.end===end&&(!!results[1].length||job.organizer_sub===sub);
}
export async function deliverGoogleEvent(id:string){
 let job=await googleMeetingEvent(id);if(!job)throw Error('No Google Calendar invitation is queued.');
 if(job.delivered_at)return calendarStatus(job)!;
 const connection=await eventConnection(job.organizer_sub);
 const [claimed]=await sql()`UPDATE google_meeting_events SET lease_until=now()+interval '90 seconds'
  WHERE meeting_id=${id} AND delivered_at IS NULL AND (lease_until IS NULL OR lease_until<now()) RETURNING *`;
 if(!claimed)return calendarStatus(await googleMeetingEvent(id))!;
 try{
  const client=google();client.setCredentials({refresh_token:openToken(connection.refresh_token,job.organizer_sub)});
  const event=await createOrRecoverGoogleEvent(client as EventTransport,job.payload as GoogleEventPayload);
  // Only expose Google Calendar links, never arbitrary provider response URLs.
  const link=event.htmlLink&&new URL(event.htmlLink);const safeLink=link&&link.protocol==='https:'&&['www.google.com','calendar.google.com'].includes(link.hostname)?link.href:null;
  await sql()`UPDATE google_meeting_events SET delivered_at=now(),html_link=${safeLink},lease_until=NULL,last_error=NULL WHERE meeting_id=${id}`;
 }catch(error){
  const permission=needsCalendarConsent(error);
  await sql()`UPDATE google_meeting_events SET lease_until=NULL,last_error=${permission?'Google Calendar permission is required. Reconnect to retry.':'Google Calendar creation is unconfirmed. Retry to check the existing event before creating anything new.'} WHERE meeting_id=${id}`;
  if(permission){
   await sql()`UPDATE google_calendar_connections SET refresh_token=NULL,granted_scopes=NULL,version=version+1,updated_at=now()
    WHERE google_sub=${job.organizer_sub} AND refresh_token=${connection.refresh_token} AND version=${connection.version}`;
   throw new CalendarPermissionRequired();
  }
 }
 return calendarStatus(await googleMeetingEvent(id))!;
}
