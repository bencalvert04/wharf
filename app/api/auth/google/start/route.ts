import {session,meeting,sameOrigin,json,sql,appUrl} from '@/lib/auth';
import {configured} from '@/lib/google';
import {beginGoogleFlow} from '@/lib/google-flow';
import {plannerAccess} from '@/lib/planner-access';
import {grantHasEventWrite} from '@/lib/google-event-payload';
import {grantHasFreeBusy} from '@/lib/calendar-access';
import {joinWithSavedCalendar,calendarConnection} from '@/lib/calendar-connection';
import {resolveInvitation} from '@/lib/meeting-participation';
import {tokenVaultConfigured} from '@/lib/token-vault';

export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 if(!configured())return json({error:'Google Calendar setup is not complete yet.'},503);
 try{
  const {meetingId,returnMeetingId,invitationToken,connectCalendar}=await req.json();
  if(meetingId!=null&&typeof meetingId!=='string')return json({error:'Invalid meeting.'},400);
  const row=meetingId?await meeting(meetingId):null;
  if(meetingId&&!row)return json({error:'Meeting not found or expired.'},404);
  if(row?.final_time)return json({error:'This meeting has already been finalized.'},409);
  if(row&&!tokenVaultConfigured())return json({error:'Ongoing calendar access is not configured yet.'},503);
  const s=(await session(true))!;
  await sql()`DELETE FROM calendar_provider_states WHERE session_id=${s.id}`;
  if(row&&JSON.parse(row.constraints).demo&&row.owner_session!==s.id)return json({error:'Create your own demo to connect a calendar.'},403);
  const constraints=row?JSON.parse(row.constraints):null;
  const connectingPlanner=!!row&&!constraints.demo&&(!row.agent_request_id||constraints.openJoin)&&(await plannerAccess(row,s)).allowed;
  const purpose=connectingPlanner?'planner_connect':connectCalendar===true?'connect':'join';
  let inviteeId:string|null=null;
  try{if(row)inviteeId=await resolveInvitation(row.id,invitationToken,s.google_sub)}catch(e){return json({error:(e as Error).message},409)}
  if(!row&&connectCalendar===true&&s.google_sub&&!/^(microsoft|icloud):/.test(s.google_sub)){
   const saved=await calendarConnection(s.google_sub);
   if(saved?.refresh_token&&!saved.disconnecting&&grantHasFreeBusy(saved.granted_scopes)){
    await sql()`DELETE FROM calendar_provider_connections WHERE account_id=${s.google_sub}`;
    return json({url:appUrl()+'/?calendar=connected'});
   }
   return json({url:await beginGoogleFlow(s.id,null,typeof returnMeetingId==='string'?returnMeetingId.slice(0,100):null,s.google_sub,null,'connect')});
  }
  if(row&&s.google_sub&&!/^(microsoft|icloud):/.test(s.google_sub)){
   const saved=await calendarConnection(s.google_sub);
   if(connectingPlanner&&!grantHasEventWrite(saved?.granted_scopes))return json({url:await beginGoogleFlow(s.id,row.id,null,s.google_sub,inviteeId,'planner_connect')});
   if(await joinWithSavedCalendar({id:row.id,constraints:row.constraints},s.google_sub,s.name||'Guest',s.id,inviteeId,true)){await sql()`DELETE FROM calendar_provider_connections WHERE account_id=${s.google_sub}`;return json({joined:true,meetingId:row.id});}
   return json({url:await beginGoogleFlow(s.id,row.id,null,s.google_sub,inviteeId,purpose)});
  }
  return json({url:await beginGoogleFlow(s.id,row?.id||null,typeof returnMeetingId==='string'?returnMeetingId.slice(0,100):null,null,inviteeId,purpose)});
 }catch{return json({error:'Could not connect Google. Please try again.'},503)}
}
