import {plannerAccess} from '@/lib/planner-access';
import {session,meeting,sameOrigin,json} from '@/lib/auth';
import {configured} from '@/lib/google';
import {beginGoogleFlow} from '@/lib/google-flow';
export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 try{
  const s=await session();if(!s?.google_sub)return json({error:'Sign in with Google first.'},401);
  const {meetingId}=await req.json();if(typeof meetingId!=='string')return json({error:'Invalid meeting.'},400);
  const row=await meeting(meetingId);if(!row)return json({error:'Meeting not found or expired.'},404);
  const access=await plannerAccess(row,s);
  if(!access.allowed)return json({error:'Only the planner can enable calendar invitations.'},403);
  if(JSON.parse(row.constraints).demo||(row.agent_request_id&&!JSON.parse(row.constraints).openJoin&&!access.slack))return json({error:'Calendar invitations are available for planner-created meetings.'},400);
  if(!configured())return json({error:'Google Calendar is not configured.'},503);
  return json({url:await beginGoogleFlow(s.id,null,row.id,s.google_sub,null,'events')});
 }catch{return json({error:'Could not start Google Calendar permission. Please try again.'},503)}
}
