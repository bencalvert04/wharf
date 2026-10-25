import {session,sameOrigin,json} from '@/lib/auth';
import {disconnectCalendar} from '@/lib/calendar-connection';
export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 try{
  const s=await session();
  if(!s?.google_sub)return json({error:'Sign in to disconnect your calendar.'},401);
  await disconnectCalendar(s.google_sub);
  return json({disconnected:true});
 }catch{return json({error:'Calendar access is paused, but Google has not confirmed revocation. Please try disconnecting again.'},503)}
}
