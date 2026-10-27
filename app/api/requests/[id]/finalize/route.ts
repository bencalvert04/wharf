import {plannerAccess} from '@/lib/planner-access';
import {bookSlackWebChoice} from '@/lib/slack-web-booking';
import {AgentError} from '@/lib/agent-api';
import {session,meeting,sql,sameOrigin,json} from '@/lib/auth';
import {availabilityRevision,validFinalSlot,type Participant} from '@/lib/finalization';
import {validEmail} from '@/lib/calendar-invitation';
import {deliverInvitations} from '@/lib/invitations';
import {eventConnection,googleMeetingEvent,commitGoogleFinalization,deliverGoogleEvent,CalendarPermissionRequired} from '@/lib/google-meeting-events';
export const maxDuration=60;
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 try{
  const {id}=await params,s=await session(),row=await meeting(id);
  if(!row)return json({error:'Meeting not found or expired.'},404);
  const access=await plannerAccess(row,s);
  if(!s||!access.allowed)return json({error:'Only the planner can create this meeting.'},403);
  const c=JSON.parse(row.constraints);
  if(c.demo||(row.agent_request_id&&!c.openJoin&&!access.slack))return json({error:'Use a planner-created meeting to send calendar invitations.'},400);
  let input;try{input=await req.json()}catch{return json({error:'Invalid meeting time.'},400)}
  if(!input||typeof input!=='object')return json({error:'Invalid meeting time.'},400);
  const {start,end,revision}=input;
  if(access.slack&&row.agent_request_id){
   const people=await sql()`SELECT google_sub,name,email,busy FROM attendees WHERE meeting_id=${id} ORDER BY google_sub` as Participant[];
   if(!row.final_time&&revision!==availabilityRevision(people))return json({error:'Attendees changed. Refresh and select a time again.'},409);
   const result=await bookSlackWebChoice(access.slack,s.google_sub,start,end);
   return json(result,result.calendar?.status==='created'?200:202);
  }
  if(row.final_time){
   if(row.final_time.start!==start||row.final_time.end!==end)return json({error:'This meeting already has a different confirmed time.'},409);
   // Previously emailed invitations keep their existing delivery path.
   if(!await googleMeetingEvent(id)){const delivery=await deliverInvitations(id);return json({finalTime:{start,end},delivery},delivery.pending?202:200)}
  }else{
   const people=await sql()`SELECT google_sub,name,email,busy FROM attendees WHERE meeting_id=${id} ORDER BY google_sub` as Participant[];
   if(!s.google_sub||!people.some(p=>p.google_sub===s.google_sub)||!validEmail(s.email))return json({error:'Join with your Google calendar first to organize this meeting.'},409);
   if(people.some(p=>!validEmail(p.email)))return json({error:'An attendee needs to sign in again and rejoin to provide a verified invitation email.'},409);
   if(revision!==availabilityRevision(people))return json({error:'Attendees changed. Refresh and select a valid time again.'},409);
   if(!validFinalSlot(c,people,start,end))return json({error:'Choose a future time that fits the meeting length and everyone’s availability.'},400);
   await eventConnection(s.google_sub);
   if(!await commitGoogleFinalization(id,c,people,start,end,s.google_sub,s.email))return json({error:'Availability changed. Refresh and select a time again.'},409);
  }
  const calendar=await deliverGoogleEvent(id);
  return json({finalTime:{start,end},calendar},calendar.status==='created'?200:202);
 }catch(error){
  if(error instanceof AgentError)return json({error:error.message},error.status);
  if(error instanceof CalendarPermissionRequired)return json({error:error.message,code:'GOOGLE_CALENDAR_PERMISSION_REQUIRED'},409);
  return json({error:'Could not confirm Google Calendar creation. Reload the meeting to check its status before retrying.'},503);
 }
}
