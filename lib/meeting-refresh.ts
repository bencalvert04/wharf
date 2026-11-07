import {withCalendarDeadline,CalendarDeadlineError} from './calendar-deadline';
import {randomUUID} from 'node:crypto';
import {sql,meeting} from './auth';
import {allowed} from './availability';
import {calendarConnection} from './calendar-connection';
import {providerConnection,readProviderAvailability} from './provider-connections';
import {google,parseBusy} from './google';
import {openToken} from './token-vault';
import {captureAccountIntent,runCalendarIntent} from './calendar-intent';
import {claimMeetingRefresh,saveMeetingRefresh,failMeetingRefresh} from './meeting-refresh-store';
export class AvailabilityRefreshError extends Error{}
export async function meetingRefreshStatus(id:string){
 const [state]=await sql()`SELECT last_checked_at,last_error,lease_until>now() AS refreshing FROM meeting_availability_refresh WHERE meeting_id=${id}`;
 return {checkedAt:state?.last_checked_at||null,error:state?.last_error||null,refreshing:!!state?.refreshing};
}
export async function refreshMeetingAvailability(id:string,force=false){
 const row=await meeting(id);
 if(!row||row.final_time||JSON.parse(row.constraints).demo)return;
 const lease=randomUUID(),claim=await claimMeetingRefresh(sql(),id,lease,force);
 if(!claim){if(force)throw new AvailabilityRefreshError('Availability is already being checked. Please try again in a moment.');return;}
 try{
  const snapshots=await withCalendarDeadline(async signal=>{
   const people=await sql()`SELECT google_sub,name FROM attendees WHERE meeting_id=${id} ORDER BY google_sub`;
   const connected=people.filter(p=>!p.google_sub.startsWith('manual:'));
   const c=JSON.parse(claim.constraints),bounds=allowed(c);
   if(!bounds.length)throw new AvailabilityRefreshError('The meeting has no valid date range.');
   const intents=await Promise.all(connected.map(p=>captureAccountIntent(sql(),p.google_sub)));
   const work=async()=>{
    const snapshots=[];
    // Batches bound provider concurrency without holding database locks during I/O.
    for(let i=0;i<connected.length;i+=5){
     snapshots.push(...await Promise.all(connected.slice(i,i+5).map(async person=>{
      try{
       signal.throwIfAborted();
       let busy;
       if((await providerConnection(person.google_sub))?.credential)busy=await readProviderAvailability(person.google_sub,c,signal);
       else{
        const connection=await calendarConnection(person.google_sub);
        if(!connection?.refresh_token||connection.disconnecting)throw Error('No usable grant');
        const client=google(signal);client.setCredentials({refresh_token:openToken(connection.refresh_token,person.google_sub)});
        const result=await client.request({url:'https://www.googleapis.com/calendar/v3/freeBusy',method:'POST',timeout:15000,data:{timeMin:new Date(bounds[0].start).toISOString(),timeMax:new Date(bounds.at(-1)!.end).toISOString(),items:[{id:'primary'}]}});
        busy=parseBusy(result.data,c);
       }
       return {sub:person.google_sub,busy:[...busy].sort((a,b)=>a.start-b.start||a.end-b.end)};
      }catch{throw new AvailabilityRefreshError(`Could not check ${person.name}’s calendar. Last known availability is shown. They may need to reconnect.`);}
     })));
    }
    signal.throwIfAborted();
    return snapshots;
   };
   if(intents.length){
    const expiresAt=intents.reduce((min,i)=>Date.parse(i.expiresAt)<Date.parse(min)?i.expiresAt:min,intents[0].expiresAt);
    const intent={sessionId:null,sequence:null,expiresAt,accounts:intents.flatMap(i=>i.accounts)};
    return {values:await runCalendarIntent(intent,work),intent};
   }else return {values:await work(),intent:null};
  });
  // Re-enter the captured account guard for the atomic save after the deadline race.
  const save=()=>saveMeetingRefresh(sql(),id,lease,Number(claim.revision),snapshots.values);
  if(!await (snapshots.intent?runCalendarIntent(snapshots.intent,save):save()))throw new AvailabilityRefreshError('Attendees or calendar connections changed during the check. Please refresh again.');
 }catch(error){
  const message=error instanceof CalendarDeadlineError||error instanceof AvailabilityRefreshError?error.message:'Calendar access changed during the check. Please refresh again. Last known availability is shown.';
  await failMeetingRefresh(sql(),id,lease,message);
  throw new AvailabilityRefreshError(message);
 }
}
