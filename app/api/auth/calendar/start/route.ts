import {beginCalendarIntent,currentCalendarIntent,runCalendarIntent} from '@/lib/calendar-intent';
import {POST as startGoogle} from '@/app/api/auth/google/start/route';
import {json,sameOrigin,sql,hash,token} from '@/lib/auth';
import {createHash} from 'node:crypto';
import {connectionContext,joinProviderMeeting} from '@/lib/provider-flow';
import {providerConnection,prepareProviderConnection} from '@/lib/provider-connections';
import {microsoftAuthorize,microsoftConfigured} from '@/lib/microsoft-calendar';
import {tokenVaultConfigured} from '@/lib/token-vault';
export const maxDuration=120;
export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 try{
  const raw=await req.text();if(raw.length>4000)return json({error:'Request too large.'},413);
  const input=JSON.parse(raw);
  if(input.provider==='google')return startGoogle(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify(input)}));
  if(input.provider==='icloud')return json({error:'Password-based iCloud connections are no longer supported. iCloud calendar access is not available yet. Choose Google or Microsoft to connect and sign in.'},410);
  if(!['microsoft','saved'].includes(input.provider))return json({error:'Choose a calendar provider.'},400);
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
  return json({error:'Choose a calendar provider.'},400);
  });
 }catch{return json({error:'Could not connect your calendar. Check your credentials and try again. No availability was added unless the connection completed.'},503)}
}
