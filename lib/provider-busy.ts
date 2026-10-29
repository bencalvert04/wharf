import {allowed,localParts,type Constraints,type Interval} from './availability.ts';
import {async as ical,expandRecurringEvent} from 'node-ical';

export function clipProviderBusy(intervals:Interval[],c:Constraints):Interval[]{
 const bounds=allowed(c);
 return intervals.flatMap(({start,end})=>{
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('Invalid calendar time.');
  return bounds.map(w=>({start:Math.max(start,w.start),end:Math.min(end,w.end)})).filter(w=>w.end>w.start);
 });
}
export function microsoftBusy(events:unknown):Interval[]{
 if(!Array.isArray(events))throw Error('Calendar returned incomplete data.');
 return events.flatMap(e=>{
  if(e.isCancelled||e.showAs==='free')return [];
  const time=(v:any)=>{
   if(typeof v?.dateTime!=='string'||v.timeZone!=='UTC')throw Error('Calendar did not return UTC times.');
   return Date.parse(v.dateTime.replace(/Z$/,'')+'Z');
  };
  const start=time(e.start),end=time(e.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('Invalid calendar time.');
  return [{start,end}];
 });
}
// DATE values are local calendar days, not UTC instants. Resolve their boundaries
// in the meeting timezone so all-day events also block DST transition days.
function localMidnight(date:Date,zone:string){
 const day=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,center=Date.parse(day+'T00:00:00Z');
 for(let t=center-14*3600000;t<=center+14*3600000;t+=60000){
  const p=localParts(t,zone);if(p.date===day&&p.time==='00:00')return t;
 }
 throw Error('Could not resolve all-day calendar time.');
}
export async function icloudBusy(objects:{data?:string}[],c:Constraints,calendarZone=c.zone):Promise<Interval[]>{
 const bounds=allowed(c);if(!bounds.length)throw Error('No meeting dates.');
 const intervals:Interval[]=[];
 for(const object of objects){
  if(typeof object.data!=='string'||!object.data.includes('BEGIN:VCALENDAR')||!object.data.includes('END:VCALENDAR'))throw Error('Incomplete iCloud calendar response.');
  const parsed=await ical.parseICS(object.data);
  for(const event of Object.values(parsed)){
   if(!event||event.type!=='VEVENT')continue;
   if(event.status==='CANCELLED')continue;
   if(!(event.start instanceof Date)||!Number.isFinite(event.start.getTime()))throw Error('Invalid iCloud event start.');
   const instances=expandRecurringEvent(event,{from:new Date(bounds[0].start-86400000),to:new Date(bounds.at(-1)!.end+86400000),expandOngoing:true});
   for(const instance of instances){
    if(instance.event.status==='CANCELLED'||instance.event.transparency==='TRANSPARENT')continue;
    const start=instance.isFullDay?localMidnight(instance.start,calendarZone):instance.start.getTime();
    const end=instance.isFullDay?localMidnight(instance.end,calendarZone):instance.end.getTime();
    intervals.push({start,end});
   }
  }
 }
 return clipProviderBusy(intervals,c);
}
