import {sql} from './auth';
import {google,parseBusy} from './google';
import {allowed,type Constraints} from './availability';
import {openToken,sealToken} from './token-vault';
import {needsCalendarConsent,revocationComplete} from './calendar-access';
import type {OAuth2Client} from 'google-auth-library';

export async function calendarConnection(sub:string){
 const [row]=await sql()`SELECT * FROM google_calendar_connections WHERE google_sub=${sub}`;
 return row||null;
}
export async function prepareCalendarConsent(sub:string){
 await sql()`INSERT INTO google_calendar_connections(google_sub) VALUES(${sub}) ON CONFLICT DO NOTHING`;
 const row=await calendarConnection(sub);
 if(row.disconnecting)throw Error('Calendar disconnection is pending.');
 return Number(row.version);
}
export async function saveCalendarGrant(sub:string,refreshToken:string,version:number){
 const [row]=await sql()`UPDATE google_calendar_connections SET refresh_token=${sealToken(refreshToken,sub)},updated_at=now()
  WHERE google_sub=${sub} AND version=${version} AND NOT disconnecting RETURNING google_sub`;
 if(!row)throw Error('Calendar connection changed. Please try again.');
}

export async function saveCalendarSnapshot(client:OAuth2Client,row:{id:string;constraints:string;owner_session?:string},sub:string,name:string,sessionId:string){
 const c=JSON.parse(row.constraints) as Constraints,bounds=allowed(c);
 if(!bounds.length)throw Error('No dates');
 const result=await client.request({url:'https://www.googleapis.com/calendar/v3/freeBusy',method:'POST',
  data:{timeMin:new Date(bounds[0].start).toISOString(),timeMax:new Date(bounds.at(-1)!.end).toISOString(),items:[{id:'primary'}]}});
 const busy=parseBusy(result.data,c);
 await sql()`INSERT INTO attendees(meeting_id,google_sub,name,busy) VALUES(${row.id},${sub},${name.slice(0,100)},${JSON.stringify(busy)}::jsonb) ON CONFLICT(meeting_id,google_sub) DO NOTHING`;
 await sql()`UPDATE requests SET planner_name=${name.slice(0,100)} WHERE id=${row.id} AND owner_session=${sessionId}`;
}

export async function joinWithSavedCalendar(row:{id:string;constraints:string;owner_session?:string},sub:string,name:string,sessionId:string){
 const connection=await calendarConnection(sub);
 if(!connection?.refresh_token||connection.disconnecting)return false;
 const client=google();
 client.setCredentials({refresh_token:openToken(connection.refresh_token,sub)});
 try{
  await saveCalendarSnapshot(client,row,sub,name,sessionId);
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
 // Block further use before contacting Google. Keep encrypted credentials on a transient
 // failure so the user can retry revocation, rather than claiming it succeeded.
 const [row]=await sql()`UPDATE google_calendar_connections SET disconnecting=true,version=version+1,updated_at=now()
  WHERE google_sub=${sub} RETURNING *`;
 await sql()`DELETE FROM oauth_states WHERE expected_sub=${sub}`;
 if(!row)return;
 if(row.refresh_token){
  const result=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({token:openToken(row.refresh_token,sub)}),signal:AbortSignal.timeout(10000)});
  const body=await result.json().catch(()=>null);
  if(!revocationComplete(result.status,body))throw Error('Google could not confirm disconnection. Please retry.');
 }
 await sql()`UPDATE google_calendar_connections SET refresh_token=NULL,disconnecting=false,updated_at=now()
  WHERE google_sub=${sub} AND version=${row.version}`;
}
