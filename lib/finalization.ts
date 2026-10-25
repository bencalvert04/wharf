import {createHash} from 'node:crypto';
import {shared,localParts,type Constraints,type Attendee} from './availability.ts';
export type Participant=Attendee & {google_sub:string;email:string|null};
export function availabilityRevision(people:Participant[]){
 return createHash('sha256').update(JSON.stringify(people.map(p=>({google_sub:p.google_sub,name:p.name,email:p.email,busy:p.busy})).sort((a,b)=>a.google_sub.localeCompare(b.google_sub)))).digest('hex');
}
export function validFinalSlot(c:Constraints,people:Attendee[],start:unknown,end:unknown,now=Date.now()):start is number{
 return typeof start==='number'&&typeof end==='number'&&Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>now&&end-start===c.duration*60000&&start%60000===0&&Number(localParts(start,c.zone).time.slice(3))%15===0&&people.length>0&&shared(c,people).some(w=>start>=w.start&&end<=w.end);
}
