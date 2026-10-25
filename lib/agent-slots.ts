import {createHash} from 'node:crypto';
import {shared,localParts,type Constraints,type Attendee} from './availability.ts';
export function meetingSlots(id:string,c:Constraints,people:Attendee[],now=Date.now()){
 if(!people.length)return [];
 const duration=c.duration*60000,slots=[];
 for(const w of shared(c,people))for(let start=w.start;start+duration<=w.end;start+=60000){
  if(start<now||Number(localParts(start,c.zone).time.slice(3))%15!==0)continue;
  const end=start+duration;
  slots.push({id:createHash('sha256').update(`${id}:${start}:${end}`).digest('base64url'),start:new Date(start).toISOString(),end:new Date(end).toISOString(),localStart:localParts(start,c.zone),localEnd:localParts(end,c.zone),timezone:c.zone,durationMinutes:c.duration});
 }
 return slots;
}
