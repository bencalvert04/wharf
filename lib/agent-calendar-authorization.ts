import {createHmac} from 'node:crypto';
import {sql,hash,appUrl} from './auth';
import {eventConnection,CalendarPermissionRequired} from './google-meeting-events';
import {saveCalendarGrant} from './calendar-connection';
import {grantHasFreeBusy} from './calendar-access';
import {grantHasEventWrite} from './google-event-payload';

export const organizerToken=(key:string,id:string,participant:string)=>createHmac('sha256',key).update(`wharf-organizer-v1:${id}:${participant}`).digest('base64url');
export async function agentCalendarAuthorization(id:string){
 const [row]=await sql()`SELECT c.*,p.google_sub AS participant_sub,p.name AS participant_name FROM agent_calendar_authorizations c JOIN request_invitees p ON p.meeting_id=c.meeting_id AND p.id=c.participant_id WHERE c.meeting_id=${id}`;
 return row||null;
}
export function organizerAuthorizationUrl(id:string,key:string,participant:string){return `${appUrl()}/agent/authorize?${new URLSearchParams({meeting:id,token:organizerToken(key,id,participant)})}`}
export async function authorizeAgentCalendar(id:string,participantId:string,sub:string){
 await eventConnection(sub);
 const [row]=await sql()`UPDATE agent_calendar_authorizations c SET authorized_sub=${sub},authorized_at=now()
 WHERE c.meeting_id=${id} AND c.participant_id=${participantId}
 AND EXISTS(SELECT 1 FROM requests r JOIN request_invitees p ON p.meeting_id=r.id WHERE r.id=c.meeting_id AND p.id=c.participant_id AND p.google_sub=${sub} AND r.created_at::timestamptz>now()-interval '30 days')
 AND (c.authorized_sub IS NULL OR c.authorized_sub=${sub}) RETURNING c.meeting_id`;
 if(!row)throw Error('Organizer changed or the meeting expired. Open the latest authorization link.');
}
export async function completeAgentCalendarAuthorization(flow:any,identity:{sub:string},tokens:{scope?:string;refresh_token?:string|null}){
 const auth=await agentCalendarAuthorization(flow.return_meeting_id);
 if(!auth||auth.participant_id!==flow.invitee_id||auth.participant_sub!==identity.sub||flow.expected_sub!==identity.sub||!grantHasFreeBusy(tokens.scope)||!grantHasEventWrite(tokens.scope)||!tokens.refresh_token)throw Error('Calendar invitation permission was not granted to the organizer.');
 await saveCalendarGrant(identity.sub,tokens.refresh_token,{version:Number(flow.connection_version),connectionId:flow.connection_id},tokens.scope);
 await authorizeAgentCalendar(flow.return_meeting_id,flow.invitee_id,identity.sub);
}
export async function publicAgentAuthorization(id:string,token:string){
 const [row]=await sql()`SELECT r.constraints,c.participant_id,c.authorized_at,c.authorized_sub,p.google_sub,p.name
 FROM agent_calendar_authorizations c JOIN requests r ON r.id=c.meeting_id JOIN request_invitees p ON p.meeting_id=c.meeting_id AND p.id=c.participant_id
 WHERE r.id=${id} AND c.token_hash=${hash(token)} AND r.created_at::timestamptz>now()-interval '30 days'`;
 return row||null;
}

export async function hasAgentCalendarPermission(sub:string|null){
 if(!sub)return false;
 try{await eventConnection(sub);return true}catch(error){if(error instanceof CalendarPermissionRequired)return false;throw error}
}
