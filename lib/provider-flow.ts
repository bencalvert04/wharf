import {captureSessionIntent,currentCalendarIntent,runCalendarIntent} from './calendar-intent';
import {session,meeting,sql} from './auth';
import {resolveInvitation,persistCalendarSnapshot} from './meeting-participation';
import {readProviderAvailability} from './provider-connections';
export async function connectionContext(input:any){
 if(input.meetingId!=null&&(typeof input.meetingId!=='string'||input.meetingId.length>100))throw Error('Invalid meeting.');
 const row=input.meetingId?await meeting(input.meetingId):null;
 if(input.meetingId&&(!row||row.final_time))throw Error('Meeting expired or already finalized.');
 const s=(await session(true))!;
 if(row&&JSON.parse(row.constraints).demo&&row.owner_session!==s.id)throw Error('Create your own demo to connect a calendar.');
 const inviteeId=row?await resolveInvitation(row.id,input.invitationToken,s.google_sub):null;
 return {s,row,inviteeId};
}
export async function joinProviderMeeting(row:{id:string;constraints:string},account:string,name:string,sessionId:string,inviteeId:string|null):Promise<void>{
 if(!currentCalendarIntent())return runCalendarIntent(await captureSessionIntent(sql(),sessionId,account),()=>joinProviderMeeting(row,account,name,sessionId,inviteeId));
 let stage='calendar-read';
 try{
  const busy=await readProviderAvailability(account,JSON.parse(row.constraints));
  stage='snapshot-save';
  await persistCalendarSnapshot(row.id,account,name,busy,sessionId,inviteeId);
 }catch(error){
  // Fixed labels only: provider responses, database messages, identities, and
  // credentials must never be copied into logs while diagnosing live failures.
  const reasons:Record<string,string>={
   'Microsoft authorization failed. Reconnect your calendar.':'microsoft-token',
   'Microsoft Calendar is unavailable. Reconnect or try again.':'microsoft-http',
   'Calendar did not return UTC times.':'calendar-timezone',
   'Invalid calendar time.':'calendar-time',
   'Calendar returned incomplete data.':'calendar-data',
   'Calendar disconnected while reading availability.':'connection-changed',
   'The meeting changed while connecting. Please try again.':'meeting-changed',
  };
  const reason=error instanceof Error?reasons[error.message]:undefined;
  const code=(error as {code?:unknown})?.code;
  console.warn('Calendar join failed',{stage,reason:reason||'other',...(typeof code==='string'&&/^[0-9A-Z]{5}$/.test(code)?{databaseCode:code}:{})});
  throw error;
 }
}
