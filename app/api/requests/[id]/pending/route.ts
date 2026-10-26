import {session,sql,sameOrigin,json} from '@/lib/auth';
import {dismissPendingMeeting} from '@/lib/pending-meeting-store';
/** Remove only this user's card. Attendance and everyone else's meeting remain intact. */
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 try{
  const s=await session();if(!s)return json({error:'Sign in first.'},401);
  const {id}=await params;
  const removed=await dismissPendingMeeting(sql(),id,s.id,s.google_sub||null);
  return removed.length?json({ok:true}):json({error:'Meeting not found or access denied.'},404);
 }catch{return json({error:'Could not remove the meeting from Pending.'},503)}
}
