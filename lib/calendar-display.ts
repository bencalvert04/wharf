import type {Constraints} from './availability';
const minute=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3,5));

// Continuous agent requests keep full-day storage bounds. Display only the
// portion of those days that intersects the actual requested interval.
export function calendarDisplayRange(c:Constraints,shownDates:string[]){
 const ranges=shownDates.filter(date=>c.days.includes(new Date(date+'T12:00Z').getUTCDay())).map(date=>{
  let start=minute(c.from),end=minute(c.to);
  if(c.windowStart){const day=c.windowStart.slice(0,10);if(date<day)return null;if(date===day)start=Math.max(start,minute(c.windowStart.slice(11)))}
  if(c.windowEnd){const day=c.windowEnd.slice(0,10);if(date>day)return null;if(date===day)end=Math.min(end,minute(c.windowEnd.slice(11)))}
  return end>start?{start,end}:null;
 }).filter((range):range is {start:number;end:number}=>range!==null);
 const startMinute=ranges.length?Math.min(...ranges.map(r=>r.start)):minute(c.from);
 const endMinute=ranges.length?Math.max(...ranges.map(r=>r.end)):minute(c.to);
 const ticks=[startMinute];
 for(let tick=Math.ceil(startMinute/60)*60;tick<endMinute;tick+=60)if(tick-startMinute>=30&&endMinute-tick>=30)ticks.push(tick);
 ticks.push(endMinute);
 return {startMinute,endMinute,ticks};
}
export function calendarTickLabel(minute:number){
 const hour=Math.floor(minute/60)%24,remainder=minute%60;
 return `${hour%12||12}${remainder?':'+String(remainder).padStart(2,'0'):''} ${hour<12?'AM':'PM'}`;
}
