import {deliverySummary} from '@/lib/delivery-summary';
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
  await queueMeetingInvitations(id);
  await deliverInvitations(id);
  const delivery=await deliverySummary(id,true);
  return json(delivery,delivery.pending?202:200);
 }catch(e){return json({error:e instanceof Error?e.message:'Unable to send invitations.'},503)}
}
