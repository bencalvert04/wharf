import {providerConnection,readProviderAvailability} from './provider-connections';
import {sql} from './auth';
import {loadAgentMeeting,AgentError} from './agent-api';
import {calendarConnection} from './calendar-connection';
import {google,parseBusy} from './google';
import {openToken} from './token-vault';
import {allowed} from './availability';
import {captureAccountIntent,runCalendarIntent} from './calendar-intent';

export async function refreshAgentAvailability(id:string,key:string){
 const row=await loadAgentMeeting(id,key);
 if(row.final_time)return;
 const constraints=JSON.parse(row.constraints),bounds=allowed(constraints);
 if(!bounds.length||!row.people.length)throw new AgentError('not_ready','No attendees or valid meeting window are available.',409,'Ask attendees to click to attend.');
 // Capture before choosing grants or fetching calendars. The final guarded SQL
 // checks the complete vector so one stale account aborts the entire refresh.
 const intents=await Promise.all(row.people.map((person:any)=>captureAccountIntent(sql(),person.googleSub)));
 // Combining captures must not renew the oldest read's replay deadline.
 const expiresAt=intents.reduce((earliest,intent)=>Date.parse(intent.expiresAt)<Date.parse(earliest)?intent.expiresAt:earliest,intents[0].expiresAt);
 try{return await runCalendarIntent({sessionId:null,sequence:null,expiresAt,accounts:intents.flatMap(intent=>intent.accounts)},async()=>{
 const snapshots=await Promise.all(row.people.map(async(person:any)=>{
  if((await providerConnection(person.googleSub))?.credential){
   try{return {sub:person.googleSub,busy:await readProviderAvailability(person.googleSub,constraints)}}catch{throw new AgentError('availability_refresh_failed',`Could not refresh ${person.name}’s calendar.`,409,'Ask them to reconnect their calendar, then try again.')}
  }
  const connection=await calendarConnection(person.googleSub);
  if(!connection?.refresh_token||connection.disconnecting)throw new AgentError('calendar_reconnect_required',`${person.name} needs to reconnect their calendar.`,409,'Ask them to open the meeting and reconnect Google, then ask me to book again.');
  const client=google();client.setCredentials({refresh_token:openToken(connection.refresh_token,person.googleSub)});
  try{
   const response=await client.request({url:'https://www.googleapis.com/calendar/v3/freeBusy',method:'POST',data:{timeMin:new Date(bounds[0].start).toISOString(),timeMax:new Date(bounds.at(-1)!.end).toISOString(),items:[{id:'primary'}]}});
   return {sub:person.googleSub,busy:parseBusy(response.data,constraints)};
  }catch{throw new AgentError('availability_refresh_failed',`Could not refresh ${person.name}’s Google Calendar.`,409,'Ask them to reconnect Google if necessary, then ask me to book again. No new time has been booked.');}
 }));
 const [saved]=await sql()`WITH changed AS (
 UPDATE requests SET revision=revision+1 WHERE id=${id} AND revision=${row.revision} AND final_time IS NULL RETURNING id
 ), updated AS (
 UPDATE attendees a SET busy=p->'busy',captured_at=now() FROM changed,jsonb_array_elements(${JSON.stringify(snapshots)}::jsonb) p
 WHERE a.meeting_id=changed.id AND a.google_sub=p->>'sub' RETURNING a.google_sub
 ) SELECT (SELECT count(*) FROM changed)::int AS changed`;
 if(!saved.changed)throw new AgentError('stale_revision','The attendees changed while calendars were being refreshed.',409,'Ask me to book again so I can check the updated group.');
 })}catch(error){
  if(error instanceof AgentError)throw error;
  throw new AgentError('availability_refresh_failed','A calendar connection changed while availability was being refreshed.',409,'Ask attendees to reconnect their calendars, then try again. No new availability was saved.');
 }
}
