import {beginCalendarIntent,runCalendarIntent} from '@/lib/calendar-intent';
import {session,sameOrigin,json,sql} from '@/lib/auth';
import {disconnectProvider} from '@/lib/provider-connections';
import {disconnectCalendar} from '@/lib/calendar-connection';
export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 try{
  const s=await session();if(!s?.google_sub)return json({error:'Sign in first.'},401);
  const intent=await beginCalendarIntent(sql(),s.id,s.google_sub);
  return await runCalendarIntent(intent,async()=>{
  await disconnectProvider(s.google_sub);
  await disconnectCalendar(s.google_sub);
  return json({disconnected:true});
  });
 }catch{return json({error:'Could not finish disconnecting. Please retry.'},503)}
}
