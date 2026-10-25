import {session,meeting,sameOrigin,json} from '@/lib/auth';
import {configured} from '@/lib/google';
import {beginGoogleFlow} from '@/lib/google-flow';
import {joinWithSavedCalendar} from '@/lib/calendar-connection';
import {tokenVaultConfigured} from '@/lib/token-vault';

export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 if(!configured())return json({error:'Google Calendar setup is not complete yet.'},503);
 try{
  const {meetingId,returnMeetingId}=await req.json();
  if(meetingId!=null&&typeof meetingId!=='string')return json({error:'Invalid meeting.'},400);
  const row=meetingId?await meeting(meetingId):null;
  if(meetingId&&!row)return json({error:'Meeting not found or expired.'},404);
  if(row&&!tokenVaultConfigured())return json({error:'Ongoing calendar access is not configured yet.'},503);
  const s=(await session(true))!;
  if(row&&JSON.parse(row.constraints).demo&&row.owner_session!==s.id)return json({error:'Create your own demo to connect a calendar.'},403);
  if(row&&s.google_sub){
   if(await joinWithSavedCalendar({id:row.id,constraints:row.constraints},s.google_sub,s.name||'Guest',s.id))return json({joined:true,meetingId:row.id});
   return json({url:await beginGoogleFlow(s.id,row.id,null,s.google_sub)});
  }
  return json({url:await beginGoogleFlow(s.id,row?.id||null,typeof returnMeetingId==='string'?returnMeetingId.slice(0,100):null)});
 }catch{return json({error:'Could not connect Google. Please try again.'},503)}
}
