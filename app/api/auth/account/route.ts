import {beginCalendarIntent,runCalendarIntent} from '@/lib/calendar-intent';
import {session,sql,sameOrigin,json} from '@/lib/auth';
import {providerConnection} from '@/lib/provider-connections';
import {calendarConnection} from '@/lib/calendar-connection';
export async function GET(){try{const s=await session();const connection=s?.google_sub?await calendarConnection(s.google_sub):null;const provider=s?.google_sub?await providerConnection(s.google_sub):null;return json({user:s?.google_sub?{name:s.name||'Wharf account',picture:s.picture||null,calendarProvider:provider?.credential?provider.provider:'google',calendarConnected:!!provider?.credential||(!!connection?.refresh_token&&!connection.disconnecting),calendarDisconnectPending:!!connection?.disconnecting}:null})}catch{return json({error:'Could not load your account.'},503)}}
export async function DELETE(req:Request){
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 try{
  const s=await session();
  if(s){
   const intent=await beginCalendarIntent(sql(),s.id,s.google_sub||null,false);
   await runCalendarIntent(intent,async()=>{
    const db=sql();await db.transaction([
     db`UPDATE sessions SET google_sub=NULL,name=NULL,picture=NULL,email=NULL WHERE id=${s.id}`,
     db`DELETE FROM oauth_states WHERE session_id=${s.id}`,
     db`DELETE FROM calendar_provider_states WHERE session_id=${s.id}`,
    ]);
   });
  }
  return json({user:null});
 }catch{return json({error:'Could not sign out.'},503)}
}
