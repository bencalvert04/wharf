import {beginCalendarIntent,currentCalendarIntent,runCalendarIntent} from '@/lib/calendar-intent';
import {POST as startGoogle} from '@/app/api/auth/google/start/route';
import {json,sameOrigin,appUrl,sql,hash,token} from '@/lib/auth';
import {createHash} from 'node:crypto';
import {connectionContext,joinProviderMeeting} from '@/lib/provider-flow';
import {providerConnection,prepareProviderConnection,storeProviderConnection} from '@/lib/provider-connections';
import {microsoftAuthorize,microsoftConfigured} from '@/lib/microsoft-calendar';
import {icloudClient,type AppleCredential} from '@/lib/icloud-calendar';
import {validEmail} from '@/lib/calendar-invitation';
import {tokenVaultConfigured} from '@/lib/token-vault';
export const maxDuration=120;
export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 try{
  const raw=await req.text();if(raw.length>4000)return json({error:'Request too large.'},413);
  const input=JSON.parse(raw);
  if(input.provider==='google')return startGoogle(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({...input,connectCalendar:true})}));
  if(!['microsoft','icloud','saved'].includes(input.provider))return json({error:'Choose a calendar provider.'},400);
  if(!tokenVaultConfigured())return json({error:'Calendar credential encryption is not configured.'},503);
  if(input.provider==='microsoft'&&!microsoftConfigured())return json({error:'Outlook setup is not complete yet. The site owner needs to configure Microsoft sign-in.'},503);
  const {s,row,inviteeId}=await connectionContext(input);
  const intent=await beginCalendarIntent(sql(),s.id,s.google_sub||null);
  return await runCalendarIntent(intent,async()=>{
  if(input.provider==='saved'){
   if(!s.google_sub||!row)return json({error:'Choose a calendar to connect.'},409);
   if(!(await providerConnection(s.google_sub))?.credential)return startGoogle(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(input)}));
   await joinProviderMeeting({id:row.id,constraints:row.constraints},s.google_sub,s.name||'Guest',s.id,inviteeId);
   return json({joined:true,meetingId:row.id});
  }
  await sql()`DELETE FROM oauth_states WHERE session_id=${s.id}`;
  await sql()`DELETE FROM calendar_provider_states WHERE session_id=${s.id}`;
  const generation=s.google_sub?await prepareProviderConnection(s.google_sub,input.provider):null;
  if(input.provider==='microsoft'){
   const state=token(),verifier=token();
   await sql()`INSERT INTO calendar_provider_states(id,session_id,expected_account,connection_id,meeting_id,return_meeting_id,invitee_id,verifier,expires_at,calendar_intent)
   VALUES(${hash(state)},${s.id},${s.google_sub||null},${generation}::uuid,${row?.id||null},${typeof input.returnMeetingId==='string'?input.returnMeetingId.slice(0,100):null},${inviteeId},${verifier},now()+interval '10 minutes',${JSON.stringify(currentCalendarIntent())}::jsonb)`;
   return json({url:microsoftAuthorize(state,createHash('sha256').update(verifier).digest('base64url'))});
  }
  const username=typeof input.username==='string'?input.username.trim().toLowerCase():'';
  const password=typeof input.password==='string'?input.password.replace(/[\s-]/g,''):'';
  if(!validEmail(username)||!/^[a-zA-Z]{16}$/.test(password))return json({error:'Enter your Apple Account email and its 16-letter app-specific password.'},400);
  const credential:AppleCredential={username,password};
  const client=await icloudClient(credential),calendars=await client.fetchCalendars();
  if(!calendars.length||!client.account?.principalUrl)return json({error:'No iCloud calendar was found for this account.'},400);
  const principal=new URL(client.account.principalUrl).pathname;
  const account=s.google_sub||'icloud:'+hash(principal);
  await storeProviderConnection(s,account,'icloud',JSON.stringify(credential),s.email||username,s.name||username.split('@')[0],generation);
  if(row)await joinProviderMeeting({id:row.id,constraints:row.constraints},account,s.name||username.split('@')[0],s.id,inviteeId);
  const returnId=row?.id||(typeof input.returnMeetingId==='string'?input.returnMeetingId.slice(0,100):null);
  return json({url:appUrl()+'/?'+new URLSearchParams({...(returnId?{meeting:returnId}:{}),calendar:row?'joined':'connected'})});
  });
 }catch{return json({error:'Could not connect your calendar. Check your credentials and try again. No availability was added unless the connection completed.'},503)}
}
