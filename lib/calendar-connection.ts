import {sql} from './auth';
import {persistCalendarSnapshot} from './meeting-participation';
import {google,parseBusy} from './google';
import {allowed,type Constraints} from './availability';
import {openToken,sealToken} from './token-vault';
import {needsCalendarConsent,revocationComplete} from './calendar-access';
import {prepareCalendarConnection,storeCalendarGrant,storeCalendarScopes,disconnectCalendarConnection,type CalendarGeneration} from './calendar-connection-store';
import type {OAuth2Client} from 'google-auth-library';

export async function calendarConnection(sub:string){
 const [row]=await sql()`SELECT * FROM google_calendar_connections WHERE google_sub=${sub}`;
 return row||null;
}
export async function prepareCalendarConsent(sub:string){
 return prepareCalendarConnection(sql(),sub);
}
export async function saveCalendarGrant(sub:string,refreshToken:string,generation:CalendarGeneration,scopes:string=''){
 await storeCalendarGrant(sql(),sub,sealToken(refreshToken,sub),generation,scopes);
}
export async function saveCalendarScopes(sub:string,encryptedToken:string,generation:CalendarGeneration,scopes:string){
 await storeCalendarScopes(sql(),sub,encryptedToken,generation,scopes);
}

export async function saveCalendarSnapshot(client:OAuth2Client,row:{id:string;constraints:string;owner_session?:string},sub:string,name:string,sessionId:string,inviteeId:string|null=null){
 const c=JSON.parse(row.constraints) as Constraints,bounds=allowed(c);
 if(!bounds.length)throw Error('No dates');
 const result=await client.request({url:'https://www.googleapis.com/calendar/v3/freeBusy',method:'POST',
  data:{timeMin:new Date(bounds[0].start).toISOString(),timeMax:new Date(bounds.at(-1)!.end).toISOString(),items:[{id:'primary'}]}});
 const busy=parseBusy(result.data,c);
 await persistCalendarSnapshot(row.id,sub,name,busy,sessionId,inviteeId);
}

export async function joinWithSavedCalendar(row:{id:string;constraints:string;owner_session?:string},sub:string,name:string,sessionId:string,inviteeId:string|null=null){
 const connection=await calendarConnection(sub);
 if(!connection?.refresh_token||connection.disconnecting)return false;
 const client=google();
 client.setCredentials({refresh_token:openToken(connection.refresh_token,sub)});
 try{
  await saveCalendarSnapshot(client,row,sub,name,sessionId,inviteeId);
  return true;
 }catch(error){
  if(!needsCalendarConsent(error))throw error;
  // A stale request must not delete credentials from a newer connection.
  await sql()`UPDATE google_calendar_connections SET refresh_token=NULL,version=version+1,updated_at=now()
   WHERE google_sub=${sub} AND refresh_token=${connection.refresh_token} AND version=${connection.version}`;
  return false;
 }
}

export async function disconnectCalendar(sub:string){
 await disconnectCalendarConnection(sql(),sub,async (encryptedToken,signal)=>{
  const result=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({token:openToken(encryptedToken,sub)}),signal});
  const body=await result.json().catch(()=>null);
  if(!revocationComplete(result.status,body))throw Error('Google could not confirm disconnection. Please retry.');
 });
}
