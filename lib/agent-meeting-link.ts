import {createHash} from 'node:crypto';
import {AgentError,createAgentMeeting} from './agent-api';
import {createMeetingLinkSchema,meetingLinkIdempotencyPattern} from './agent-contract';

export async function createAgentMeetingLink(req:Request,raw:unknown){
 const input=createMeetingLinkSchema.parse(raw);
 const retryKey=req.headers.get('idempotency-key');
 if(!retryKey||!new RegExp(meetingLinkIdempotencyPattern).test(retryKey))throw new AgentError(
  'idempotency_key_required','Supply a random UUID v4 or 32-byte base64url Idempotency-Key.',400,
  'Generate and save a random UUID v4 before calling. Reuse it and the same body after timeouts. Keep this key private.'
 );
 // One private retry key replaces the two credentials required by the advanced API.
 // Domain separation prevents collisions with caller-chosen advanced meeting keys.
 const key=createHash('sha256').update(`wharf-meeting-link-v1:${retryKey}`).digest('base64url');
 const internal=new Request(req.url,{headers:{authorization:`Bearer ${key}`,'idempotency-key':retryKey}});
 const meeting=await createAgentMeeting(internal,{...input,openJoin:true}).catch(error=>{
  if(error instanceof AgentError&&['idempotency_conflict','meeting_expired'].includes(error.code))throw new AgentError(error.code,error.message,error.status,error.code==='idempotency_conflict'?'Reuse the original body for a retry, or generate and save a new random Idempotency-Key for a different meeting.':'Generate and save a new random Idempotency-Key to create a new meeting.');
  throw error;
 });
 const invitationUrl=meeting.invitationUrl!;
 const finalized=meeting.status==='finalized';
 return {
  id:meeting.id,invitationUrl,status:meeting.status,expiresAt:meeting.expiresAt,replayed:meeting.replayed,
  shareMessage:finalized?`View the meeting on Wharf: ${invitationUrl}`:`Join this ${input.durationMinutes}-minute meeting on Wharf to share your availability: ${invitationUrl}`,
  nextAction:{type:finalized?'view_meeting':'share_link',message:finalized?'Open invitationUrl to see the confirmed time and invitation status.':'Share invitationUrl in the group chat. Each person joins as themselves. The first person to connect becomes the human planner, who chooses a time and sends invitations on Wharf. Creating a link does not book a meeting.'}
 };
}
