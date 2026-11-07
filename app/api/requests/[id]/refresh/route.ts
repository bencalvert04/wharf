import {json,meeting,sameOrigin,session,sql} from '@/lib/auth';
import {plannerAccess} from '@/lib/planner-access';
import {manualAttendeeId} from '@/lib/manual-attendee';
import {refreshMeetingAvailability,meetingRefreshStatus,AvailabilityRefreshError} from '@/lib/meeting-refresh';
export const maxDuration=60;
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 try{
  const {id}=await params,row=await meeting(id),visitor=await session();
  if(!row)return json({error:'Meeting not found or expired.'},404);
  if(!visitor)return json({error:'Join this meeting to refresh availability.'},403);
  const access=await plannerAccess(row,visitor);
  const [joined]=await sql()`SELECT 1 FROM attendees WHERE meeting_id=${id} AND google_sub IN (${visitor.google_sub||null},${manualAttendeeId(id,visitor.id)})`;
  if(!access.allowed&&!joined)return json({error:'Join this meeting to refresh availability.'},403);
  if(row.final_time||JSON.parse(row.constraints).demo)return json({stopped:true});
  const input=await req.json().catch(()=>null);
  const force=access.allowed&&input?.force===true;
  if(force){
   const [recent]=await sql()`SELECT 1 FROM meeting_availability_refresh WHERE meeting_id=${id} AND last_attempt_at>now()-interval '10 seconds'`;
   if(recent)return json({error:'A calendar check was requested recently. Wait a few seconds before refreshing again.'},429);
  }
  await refreshMeetingAvailability(id,force);
  return json(await meetingRefreshStatus(id));
 }catch(error){return json({error:error instanceof AvailabilityRefreshError?error.message:'Could not refresh availability. Last known times are shown.'},503)}
}
