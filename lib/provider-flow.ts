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
 const busy=await readProviderAvailability(account,JSON.parse(row.constraints));
 await persistCalendarSnapshot(row.id,account,name,busy,sessionId,inviteeId);
}
