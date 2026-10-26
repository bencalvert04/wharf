import {googleMeetingEvent,deliverGoogleEvent,CalendarPermissionRequired} from '@/lib/google-meeting-events';
import {session,meeting,sameOrigin,json} from '@/lib/auth';
import {queueMeetingInvitations,deliverInvitations} from '@/lib/invitations';
export const maxDuration=60;
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 try{
  const {id}=await params;
  const s=await session();
  if(!s)return json({error:'Sign in as the planner first.'},401);
  const row=await meeting(id);
  if(!row)return json({error:'Meeting not found or expired.'},404);
  if(row.owner_session!==s.id)return json({error:'Only the planner can send invitations.'},403);
  if(await googleMeetingEvent(id)){const calendar=await deliverGoogleEvent(id);return json({calendar},calendar.status==='created'?200:202)}
  await queueMeetingInvitations(id);
  const delivery=await deliverInvitations(id);
  return json(delivery,delivery.pending?202:200);
 }catch(e){if(e instanceof CalendarPermissionRequired)return json({error:e.message,code:'GOOGLE_CALENDAR_PERMISSION_REQUIRED'},409);return json({error:e instanceof Error?e.message:'Unable to send invitations.'},503)}
}
