import {grantHasEventWrite} from '@/lib/google-event-payload';
import {session,sql,hash,meeting,appUrl} from '@/lib/auth';
import {validEmail} from '@/lib/calendar-invitation';
import {google} from '@/lib/google';
import {beginGoogleFlow} from '@/lib/google-flow';
import {joinWithSavedCalendar,saveCalendarGrant,saveCalendarSnapshot} from '@/lib/calendar-connection';
import {grantHasFreeBusy} from '@/lib/calendar-access';

export async function GET(req:Request){
 let id='';
 const redirect=(message:string)=>Response.redirect(appUrl()+'/?'+new URLSearchParams({...(id?{meeting:id}:{}),calendar:message}),303);
 try{
  const p=new URL(req.url).searchParams,s=await session(),state=p.get('state');
  if(!s||!state)return redirect('expired');
  const [flow]=await sql()`DELETE FROM oauth_states WHERE id=${hash(state)} AND session_id=${s.id} AND expires_at>now() RETURNING *`;
  if(!flow)return redirect('expired');
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
  await sql()`UPDATE sessions SET google_sub=${identity.sub},name=${name},picture=${picture},email=${identity.email} WHERE id=${s.id}`;
  if(flow.purpose==='events'){
   const planned=await meeting(flow.return_meeting_id);
   if(!planned||planned.owner_session!==s.id||JSON.parse(planned.constraints).demo)return redirect('expired');
   if(!grantHasFreeBusy(tokens.scope)||!grantHasEventWrite(tokens.scope)||!tokens.refresh_token)return redirect('eventpermission');
   await saveCalendarGrant(identity.sub,tokens.refresh_token,Number(flow.connection_version),tokens.scope);
   return redirect('eventready');
  }
  if(!row)return redirect('signedin');
  if(flow.expected_sub){
   // Google may allow profile sign-in while the user declines calendar permission.
   if(!grantHasFreeBusy(tokens.scope)||!tokens.refresh_token)return redirect('permission');
   await saveCalendarGrant(identity.sub,tokens.refresh_token,Number(flow.connection_version),tokens.scope);
   client.setCredentials(tokens);
   await saveCalendarSnapshot(client,{id:row.id,constraints:row.constraints},identity.sub,name,s.id,flow.invitee_id||null);
   return redirect('joined');
  }
  if(await joinWithSavedCalendar({id:row.id,constraints:row.constraints},identity.sub,name,s.id,flow.invitee_id||null))return redirect('joined');
  return Response.redirect(await beginGoogleFlow(s.id,row.id,null,identity.sub,flow.invitee_id||null),303);
 }catch{return redirect('failed')}
}
