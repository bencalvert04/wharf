import {deliverySummary} from '@/lib/delivery-summary';
import {commitFinalization} from '@/lib/commit-finalization';
import {session,meeting,sql,sameOrigin,json} from '@/lib/auth';
import {availabilityRevision,validFinalSlot,type Participant} from '@/lib/finalization';
import {validEmail} from '@/lib/calendar-invitation';
import {invitationsConfigured,deliverInvitations} from '@/lib/invitations';
export const maxDuration=60;
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 try{
  const {id}=await params,s=await session(),row=await meeting(id);
  if(!row)return json({error:'Meeting not found or expired.'},404);
  if(!s||s.id!==row.owner_session)return json({error:'Only the planner can create this meeting.'},403);
  const c=JSON.parse(row.constraints);
  if(c.demo)return json({error:'Sample meetings cannot send invitations.'},400);
  let input;try{input=await req.json()}catch{return json({error:'Invalid meeting time.'},400)}
  if(!input||typeof input!=='object')return json({error:'Invalid meeting time.'},400);
  const {start,end,revision}=input;
  if(!invitationsConfigured())return json({error:'Invitation sending is not configured yet.'},503);
  if(row.final_time){
   if(row.final_time.start!==start||row.final_time.end!==end)return json({error:'This meeting already has a different confirmed time.'},409);
  }else{
   const people=await sql()`SELECT google_sub,name,email,busy FROM attendees WHERE meeting_id=${id} ORDER BY google_sub` as Participant[];
   if(!s.google_sub||!people.some(p=>p.google_sub===s.google_sub))return json({error:'Join with your Google calendar first so you receive an invitation too.'},409);
   if(people.some(p=>!validEmail(p.email)))return json({error:'An attendee needs to sign in again and rejoin to provide a verified invitation email.'},409);
   if(revision!==availabilityRevision(people))return json({error:'Attendees changed. Refresh and select a valid time again.'},409);
   if(!validFinalSlot(c,people,start,end))return json({error:'Choose a future time that fits the meeting length and everyone’s availability.'},400);
   if(!await commitFinalization(id,c,people,start,end))return json({error:'Availability changed. Refresh and select a time again.'},409);
  }
  await deliverInvitations(id);
  const delivery=await deliverySummary(id,true);
  return json({finalTime:{start,end},delivery},delivery.pending?202:200);
 }catch{return json({error:'Could not confirm invitation delivery. Reload the meeting to check its status before trying again.'},503)}
}
