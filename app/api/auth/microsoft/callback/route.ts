import {session,sql,hash,meeting,appUrl} from '@/lib/auth';
import {microsoftTokens,microsoftProfile,microsoftRedirect} from '@/lib/microsoft-calendar';
import {storeProviderConnection} from '@/lib/provider-connections';
import {joinProviderMeeting} from '@/lib/provider-flow';
import {validEmail} from '@/lib/calendar-invitation';
export const maxDuration=120;
export async function GET(req:Request){
 let id='';
 const redirect=(status:string)=>Response.redirect(appUrl()+'/?'+new URLSearchParams({...(id?{meeting:id}:{}),calendar:status}),303);
 try{
  const p=new URL(req.url).searchParams,s=await session(),state=p.get('state');
  if(!s||!state)return redirect('expired');
  const [flow]=await sql()`DELETE FROM calendar_provider_states WHERE id=${hash(state)} AND session_id=${s.id} AND expires_at>now() RETURNING *`;
  if(!flow||(s.google_sub||null)!==flow.expected_account)return redirect('expired');
  id=flow.meeting_id||flow.return_meeting_id||'';
  if(p.has('error'))return redirect('cancelled');
  const code=p.get('code'),row=flow.meeting_id?await meeting(flow.meeting_id):null;
  if(!code||(flow.meeting_id&&(!row||row.final_time)))return redirect('expired');
  if(row&&JSON.parse(row.constraints).demo&&row.owner_session!==s.id)return redirect('expired');
  const tokens=await microsoftTokens({grant_type:'authorization_code',code,code_verifier:flow.verifier,redirect_uri:microsoftRedirect()});
  if(!tokens.refresh_token||!tokens.scope.toLowerCase().split(/\s+/).includes('calendars.readbasic'))return redirect('permission');
  const identity=await microsoftProfile(tokens.access_token);
  if(!validEmail(identity.email))return redirect('failed');
  const account=s.google_sub||'microsoft:'+identity.id;
  await storeProviderConnection(s,account,'microsoft',tokens.refresh_token,s.email||identity.email,s.name||identity.name||'Outlook user',flow.connection_id);
  if(row)await joinProviderMeeting({id:row.id,constraints:row.constraints},account,s.name||identity.name||'Outlook user',s.id,flow.invitee_id||null);
  return redirect(row?'joined':'connected');
 }catch{return redirect('failed')}
}
