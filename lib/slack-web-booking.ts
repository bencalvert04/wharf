import {openToken} from './token-vault';
import {loadAgentMeeting,AgentError} from './agent-api';
import {bookAgentMeeting,prepareAgentCalendar} from './agent-booking';
import {authorizeAgentCalendar} from './agent-calendar-authorization';
import {eventConnection} from './google-meeting-events';
import {meetingSlots} from './agent-slots';
export async function bookSlackWebChoice(r:any,sub:string,start:number,end:number){
 const key=openToken(r.key_cipher,`slack:${r.id}`),row=await loadAgentMeeting(r.meeting_id,key);
 const person=row.invitees.find((p:any)=>p.id===r.organizer_id&&p.googleSub===sub)||
  (r.draft.openJoin?row.invitees.find((p:any)=>p.googleSub===sub):null);
 if(!person)throw new AgentError('organizer_not_joined','The requester must connect their calendar first.',409);
 const final=row.final_time;
 const choice=final&&Date.parse(final.start)===start&&Date.parse(final.end)===end&&final.slotId?
  {slotId:final.slotId,revision:final.basedOnRevision}:null;
 const slot=choice?null:meetingSlots(row.id,JSON.parse(row.constraints),row.people).find(s=>Date.parse(s.start)===start&&Date.parse(s.end)===end);
 if(!choice&&!slot)throw new AgentError('invalid_slot','Choose a future time that fits everyone.',409);
 await eventConnection(sub);
 await prepareAgentCalendar(row.id,key,{organizerParticipantId:person.id});
 await authorizeAgentCalendar(row.id,person.id,sub);
 const booked=await bookAgentMeeting(row.id,key,choice||{slotId:slot!.id,revision:Number(row.revision)});
 return {finalTime:{start,end},calendar:booked.calendar};
}
