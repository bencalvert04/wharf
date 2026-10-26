import {session,sql,sameOrigin,json} from '@/lib/auth';
import {recordMeetingVisit} from '@/lib/pending-meeting-store';
/** Called on deliberate page entry, never on GET polling or list refresh. */
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 try{
  const s=await session();if(!s)return json({error:'Sign in first.'},401);
  const {id}=await params;
  const changed=await recordMeetingVisit(sql(),id,s.id,s.google_sub||null);
  return changed.length?json({ok:true}):json({error:'No unfinished meeting access.'},403);
 }catch{return json({error:'Could not record meeting activity.'},503)}
}
