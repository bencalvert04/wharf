import {sql,hash,appUrl} from './auth';
import {AgentError,loadAgentMeeting,describeMeeting,getAgentMeeting} from './agent-api';
import {prepareCalendarSchema,finalizeSchema} from './agent-contract';
import {agentCalendarAuthorization,organizerToken,organizerAuthorizationUrl,hasAgentCalendarPermission} from './agent-calendar-authorization';
import {eventConnection,CalendarPermissionRequired,googleMeetingEvent,deliverGoogleEvent} from './google-meeting-events';
import {googleEventPayload} from './google-event-payload';
import {meetingSlots} from './agent-slots';
import {validEmail} from './calendar-invitation';

export async function prepareAgentCalendar(id:string,key:string,raw:unknown){
 const {organizerParticipantId}=prepareCalendarSchema.parse(raw),row=await loadAgentMeeting(id,key);
 const person=row.invitees.find((p:any)=>p.id===organizerParticipantId);
 if(!person)throw new AgentError('invalid_organizer','The organizer must be in this meeting’s participant roster.');
 if(!person.googleSub||!row.people.some((p:any)=>p.googleSub===person.googleSub))throw new AgentError('organizer_not_joined','The organizer must first join using their personal invitation.',409,'Send the organizer their participant invitationUrl and wait for their response, then retry.');
 const tokenHash=hash(organizerToken(key,id,organizerParticipantId));
 await sql()`INSERT INTO agent_calendar_authorizations(meeting_id,participant_id,token_hash) VALUES(${id},${organizerParticipantId},${tokenHash}) ON CONFLICT(meeting_id) DO NOTHING`;
 const auth=await agentCalendarAuthorization(id);
 if(auth.participant_id!==organizerParticipantId)throw new AgentError('organizer_already_selected','This meeting already has a different organizer.',409,'Keep the original organizer, or create a separate meeting if the organizer must change.');
 return {meetingId:id,organizerParticipantId,authorized:!!auth.authorized_at&&auth.authorized_sub===person.googleSub&&await hasAgentCalendarPermission(auth.authorized_sub),authorizationUrl:organizerAuthorizationUrl(id,key,organizerParticipantId),nextAction:{type:'authorize_calendar',message:'Give this private link only to the organizer. They explicitly authorize this agent to create one event and invite everyone. Never automate their consent.'}};
}

export async function queueAgentBooking(id:string,key:string,raw:unknown){
 const input=finalizeSchema.parse(raw),row=await loadAgentMeeting(id,key),view=describeMeeting(row,key),job=await googleMeetingEvent(id);
 if(row.final_time&&(row.final_time.slotId!==input.slotId||row.final_time.basedOnRevision!==input.revision))throw new AgentError('already_finalized','This meeting has a different confirmed choice.',409,'Read the meeting. Retry only the original slotId and basedOnRevision.');
 if(job)return {replayed:true};
 const auth=await agentCalendarAuthorization(id);
 if(!auth?.authorized_at||!auth.authorized_sub||auth.authorized_sub!==auth.participant_sub)throw new AgentError('calendar_authorization_required','The organizer must authorize calendar invitations for this meeting.',409,'Call wharf_prepare_calendar or POST /calendar with organizerParticipantId, then give the authorizationUrl to the organizer.');
 try{await eventConnection(auth.authorized_sub)}catch(error){if(error instanceof CalendarPermissionRequired)throw new AgentError('calendar_authorization_required','Google Calendar permission needs to be renewed.',409,'Call POST /calendar with the same organizerParticipantId and have the organizer reopen authorizationUrl.');throw error}
 if(!row.final_time&&Number(row.revision)!==input.revision)throw new AgentError('stale_revision','Responses changed since you read the slots.',409,'Get slots again and use their revision.');
 if(view.responseSummary.waitingFor.length)throw new AgentError('not_ready','Every participant must respond before booking.',409,'Wait for all participants, then read slots again.');
 const slot=meetingSlots(id,JSON.parse(row.constraints),row.people).find(s=>s.id===input.slotId);
 if(!slot)throw new AgentError('invalid_slot','Choose a future exact slot that fits everyone.',409,'Get slots again. If this meeting was already finalized, create a new request for a different choice.');
 const attendees=await sql()`SELECT google_sub,name,email FROM attendees WHERE meeting_id=${id} ORDER BY google_sub`;
 const organizer=attendees.find(p=>p.google_sub===auth.authorized_sub);
 if(!organizer||!validEmail(organizer.email)||attendees.some(p=>!validEmail(p.email)))throw new AgentError('verified_email_required','Every attendee needs a verified Google email for invitations.',409,'Ask participants with older responses to sign in and rejoin before confirming a slot.');
 const payload=googleEventPayload({id,title:JSON.parse(row.constraints).title,start:Date.parse(slot.start),end:Date.parse(slot.end),zone:slot.timezone,organizerSub:auth.authorized_sub,organizerEmail:organizer.email,attendees:attendees.map(p=>({name:p.name,email:p.email})),url:appUrl()+'/?meeting='+id});
 const finalTime=row.final_time||{slotId:slot.id,start:slot.start,end:slot.end,timezone:slot.timezone,basedOnRevision:input.revision,confirmedAt:new Date().toISOString()};
 // Lock the request first. Every attendance write also increments this row's revision.
 // Freeze the choice and durable event job in one statement, so a retry cannot lose delivery.
 const db=sql();await db.transaction([
 db`SELECT id FROM requests WHERE id=${id} FOR UPDATE`,
 db`WITH changed AS (
 UPDATE requests SET final_time=${JSON.stringify(finalTime)}::jsonb,revision=revision+1
 WHERE id=${id} AND revision=${row.revision}
 AND NOT EXISTS(SELECT 1 FROM google_meeting_events WHERE meeting_id=${id})
 AND EXISTS(SELECT 1 FROM agent_calendar_authorizations c JOIN request_invitees p ON p.meeting_id=c.meeting_id AND p.id=c.participant_id WHERE c.meeting_id=${id} AND c.authorized_sub=${auth.authorized_sub} AND p.google_sub=c.authorized_sub AND c.authorized_at IS NOT NULL)
 RETURNING id
 ) INSERT INTO google_meeting_events(meeting_id,organizer_sub,event_id,payload)
 SELECT id,${auth.authorized_sub},${payload.id},${JSON.stringify(payload)}::jsonb FROM changed ON CONFLICT(meeting_id) DO NOTHING`
 ]);
 const saved=await googleMeetingEvent(id),current=await loadAgentMeeting(id,key);
 if(!saved||current.final_time?.slotId!==input.slotId||current.final_time?.basedOnRevision!==input.revision)throw new AgentError('stale_revision','The meeting changed during booking.',409,'Read the meeting and slots again.');
 return {replayed:false};
}
export async function bookAgentMeeting(id:string,key:string,raw:unknown){const queued=await queueAgentBooking(id,key,raw);await deliver(id);return {...await getAgentMeeting(id,key),...queued}}
async function deliver(id:string){try{await deliverGoogleEvent(id)}catch(error){if(error instanceof CalendarPermissionRequired)throw new AgentError('calendar_authorization_required','The event is queued, but Google Calendar permission needs renewal.',409,'Use POST /calendar with the same organizer, complete authorization, then retry /book with the original slotId and revision.');throw error}}
