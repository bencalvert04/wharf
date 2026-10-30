import {bindCalendarAccount,runCalendarIntent} from '@/lib/calendar-intent';
import {captureGoogleSwitch,isStandaloneProviderAccount} from '@/lib/provider-switch-guard';
import {plannerAccess} from '@/lib/planner-access';
import {after} from 'next/server';
import {resumeSlackBooking} from '@/lib/slack-workflow';
import {completeSlackAttendance} from '@/lib/slack-attendance';
import {completeAgentCalendarAuthorization} from '@/lib/agent-calendar-authorization';
import {grantHasEventWrite} from '@/lib/google-event-payload';
import {session,sql,hash,meeting,appUrl} from '@/lib/auth';
import {validEmail} from '@/lib/calendar-invitation';
import {google} from '@/lib/google';
import {beginGoogleFlow} from '@/lib/google-flow';
import {joinWithSavedCalendar,saveCalendarGrant,saveCalendarSnapshot} from '@/lib/calendar-connection';
import {grantHasFreeBusy} from '@/lib/calendar-access';

export const maxDuration=120;

export async function GET(req:Request){
 let id='',agentAuthorization=false;
 let slackReturn:string|null=null;
 const finishAttendance=async(flow:any,sessionId:string,sub:string)=>{if(flow.slack_attendance_id){await completeSlackAttendance(flow.slack_attendance_id,sessionId,sub)}};
 const redirect=(message:string)=>slackReturn&&message==='joined'?Response.redirect(slackReturn,303):agentAuthorization?Response.redirect(appUrl()+'/agent/authorize?status='+(['eventready'].includes(message)?'authorized':'failed'),303):Response.redirect(appUrl()+'/?'+new URLSearchParams({...(id?{meeting:id}:{}),calendar:message}),303);
 try{
  const p=new URL(req.url).searchParams,s=await session(),state=p.get('state');
  if(!s||!state)return redirect('expired');
  if(isStandaloneProviderAccount(s.google_sub))return redirect('accountswitch');
  // Capture before consuming state: a newer provider start invalidates that state.
  let switchGuard=s.google_sub?await captureGoogleSwitch(sql(),s.google_sub,s.id,s.google_sub):null;
  const [flow]=await sql()`DELETE FROM oauth_states WHERE id=${hash(state)} AND session_id=${s.id} AND expires_at>now() RETURNING *`;
  if(!flow?.calendar_intent)return redirect('expired');
  return await runCalendarIntent(flow.calendar_intent,async()=>{
  // Reject already-superseded flows before exchanging a provider code.
  await sql()`SELECT 1 AS active_calendar_intent`;
  if(flow.slack_attendance_id){
   const [link]=await sql()`SELECT s.team_id,s.channel_id FROM slack_attendance_links l JOIN slack_meetings s ON s.id=l.slack_meeting_id WHERE l.id=${flow.slack_attendance_id} AND l.session_id=${s.id} AND l.expires_at>now() AND l.completed_at IS NULL`;
   if(!link)return redirect('expired');
   slackReturn=`https://app.slack.com/client/${encodeURIComponent(link.team_id)}/${encodeURIComponent(link.channel_id)}`;
  }
  agentAuthorization=flow.purpose==='agent_events';
  id=flow.meeting_id||flow.return_meeting_id||'';
  if(p.has('error'))return redirect('cancelled');
  const code=p.get('code'),row=flow.meeting_id?await meeting(flow.meeting_id):null;
  if(!code||(flow.meeting_id&&(!row||row.final_time)))return redirect('expired');
  if(row&&JSON.parse(row.constraints).demo&&row.owner_session!==s.id)return redirect('expired');
  const client=google(),{tokens}=await client.getToken({code,codeVerifier:flow.verifier});
  if(!tokens.id_token||!tokens.access_token)throw Error('Missing token');
  const ticket=await client.verifyIdToken({idToken:tokens.id_token,audience:process.env.GOOGLE_CLIENT_ID}),identity=ticket.getPayload();
  if(!identity?.sub||identity.email_verified!==true||!validEmail(identity.email)||identity.nonce!==flow.nonce||(flow.expected_sub&&identity.sub!==flow.expected_sub))throw Error('Invalid identity');
  let picture:string|null=null;
  try{const url=new URL(identity.picture||'');if(url.protocol==='https:'&&(url.hostname==='googleusercontent.com'||url.hostname.endsWith('.googleusercontent.com')))picture=url.href}catch{}
  const name=(identity.name||'Guest').slice(0,100);
  await bindCalendarAccount(sql(),identity.sub);
  await switchGuard?.check();
  // An ordinary Google account switch must never remove the prior account's grant.
  if(!switchGuard||s.google_sub!==identity.sub)switchGuard=await captureGoogleSwitch(sql(),identity.sub,s.id,s.google_sub||null);
  await switchGuard.check();
  const [updated]=await sql()`UPDATE sessions SET google_sub=${identity.sub},name=${name},picture=${picture},email=${identity.email} WHERE id=${s.id} AND google_sub IS NOT DISTINCT FROM ${s.google_sub||null}::text AND expires_at>now() RETURNING id`;
  if(!updated)return redirect('expired');
  const checkSwitch=()=>switchGuard!.check(identity.sub);
  if(agentAuthorization){await completeAgentCalendarAuthorization(flow,identity,tokens);after(()=>resumeSlackBooking(flow.return_meeting_id));return redirect('eventready')}
  if(flow.purpose==='events'){
   const planned=await meeting(flow.return_meeting_id);
   if(!planned||!(await plannerAccess(planned,s)).allowed||JSON.parse(planned.constraints).demo)return redirect('expired');
   if(!grantHasFreeBusy(tokens.scope)||!grantHasEventWrite(tokens.scope)||!tokens.refresh_token)return redirect('eventpermission');
   await saveCalendarGrant(identity.sub,tokens.refresh_token,{version:Number(flow.connection_version),connectionId:flow.connection_id},tokens.scope);
   return redirect('eventready');
  }
  if(!row)return redirect('signedin');
  if(flow.expected_sub){
   // Google may allow profile sign-in while the user declines calendar permission.
   if(!grantHasFreeBusy(tokens.scope)||!tokens.refresh_token)return redirect('permission');
   await saveCalendarGrant(identity.sub,tokens.refresh_token,{version:Number(flow.connection_version),connectionId:flow.connection_id},tokens.scope);
   client.setCredentials(tokens);
   await saveCalendarSnapshot(client,{id:row.id,constraints:row.constraints},identity.sub,name,s.id,flow.invitee_id||null,checkSwitch);
   await finishAttendance(flow,s.id,identity.sub);
   await switchGuard.remove(identity.sub);
   return redirect('joined');
  }
  if(await joinWithSavedCalendar({id:row.id,constraints:row.constraints},identity.sub,name,s.id,flow.invitee_id||null,true,checkSwitch)){await switchGuard.remove(identity.sub);await finishAttendance(flow,s.id,identity.sub);return redirect('joined')}
  return Response.redirect(await beginGoogleFlow(s.id,row.id,null,identity.sub,flow.invitee_id||null,'join',flow.slack_attendance_id||null),303);
  });
 }catch{return redirect('failed')}
}
