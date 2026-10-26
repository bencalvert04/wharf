export type Constraints = { title:string; demo?:boolean; sampleCount?:number; start:string; end:string; duration:number; zone:string; from:string; to:string; days:number[]; windowStart?:string; windowEnd?:string };
export type Interval = {start:number; end:number};
export type Attendee = {name:string; busy:Interval[]};
export type Window = Interval & {date:string; people:string[]};
const formatters = new Map<string,Intl.DateTimeFormat>();
export function localParts(t:number,zone:string) {
 if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
 const p = formatters.get(zone)!.formatToParts(t);
 const get=(k:string)=>p.find(x=>x.type===k)!.value;
 return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};
}
export function dates(c:Constraints) {const out:string[]=[]; for(let t=Date.parse(c.start+'T00:00:00Z');t<=Date.parse(c.end+'T00:00:00Z');t+=86400000)out.push(new Date(t).toISOString().slice(0,10)); return out;}
export function allowed(c:Constraints):Window[] {
 // Scan UTC minutes to respect both skipped and repeated local times around DST.
 const out:Window[]=[]; let active:Window|undefined;
 const lo=Date.parse(c.start+'T00:00:00Z')-86400000, hi=Date.parse(c.end+'T00:00:00Z')+172800000;
 for(let t=lo;t<hi;t+=60000){const p=localParts(t,c.zone);const valid=p.date>=c.start&&p.date<=c.end&&c.days.includes(new Date(p.date+'T12:00:00Z').getUTCDay())&&p.time>=c.from&&p.time<c.to&&(!c.windowStart||`${p.date}T${p.time}`>=c.windowStart)&&(!c.windowEnd||`${p.date}T${p.time}`<c.windowEnd);
 if(valid){if(active&&active.end===t&&active.date===p.date)active.end=t+60000;else {active={start:t,end:t+60000,date:p.date,people:[]};out.push(active)}}else active=undefined;
 } return out;
}
export function shared(c:Constraints,people:Attendee[]):Window[] {
 let windows=allowed(c);
 for(const person of people)for(const busy of person.busy){ windows=windows.flatMap(w=>busy.end<=w.start||busy.start>=w.end?[w]:[{...w,end:Math.min(w.end,busy.start)},{...w,start:Math.max(w.start,busy.end)}].filter(x=>x.end>x.start)); }
 return windows.map(w=>{let start=Math.ceil(w.start/60000)*60000;while(start<w.end&&Number(localParts(start,c.zone).time.slice(3))%15!==0)start+=60000;return {...w,start,people:people.map(p=>p.name)}}).filter(w=>w.end-w.start>=15*60000);
}
export function alternatives(c:Constraints,people:Attendee[]):Window[]{
 const result:Window[]=[];
 for(const w of allowed(c)){for(let t=w.start;t+c.duration*60000<=w.end;t+=60000){if(Number(localParts(t,c.zone).time.slice(3))%15)continue;const end=t+c.duration*60000;const free=people.filter(p=>!p.busy.some(b=>b.start<end&&b.end>t)).map(p=>p.name);if(!free.length)continue;const prev=result.at(-1);if(prev&&prev.date===w.date&&prev.people.join()===free.join()&&t<=prev.end)prev.end=end;else result.push({start:t,end,date:w.date,people:free});}}
 return result.sort((a,b)=>b.people.length-a.people.length||a.start-b.start);
}
export function validate(c:Constraints) {
 if(!c||typeof c.title!=='string'||c.title.length>100)throw Error('Give your meeting a title of up to 100 characters.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(c.start)||!/^\d{4}-\d{2}-\d{2}$/.test(c.end)||!Number.isFinite(Date.parse(c.start))||!Number.isFinite(Date.parse(c.end)))throw Error('Choose valid dates.');
 for(const d of [c.start,c.end])if(new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d)throw Error('Choose valid dates.');
 const length=(Date.parse(c.end)-Date.parse(c.start))/86400000;
 if(length<0||length>30)throw Error('Choose a date range of up to 31 days.');
 if(!Number.isInteger(c.duration)||c.duration<15||c.duration>480)throw Error('Duration must be between 15 and 480 minutes.');
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(c.from)||!/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(c.to)||c.from>=c.to)throw Error('End time must be after start time.');
 if(c.windowStart!==undefined||c.windowEnd!==undefined){
  const validBound=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v.slice(0,10)+'T00:00Z').toISOString().slice(0,10)===v.slice(0,10);
  if(!validBound(c.windowStart)||!validBound(c.windowEnd)||c.windowStart!>=c.windowEnd!||c.windowStart!.slice(0,10)!==c.start||c.windowEnd!.slice(0,10)!==c.end)throw Error('Choose valid continuous time bounds.');
 }
 if(!Array.isArray(c.days)||!c.days.length||c.days.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error('Select at least one weekday.');
 try{new Intl.DateTimeFormat('en',{timeZone:c.zone}).format()}catch{throw Error('Choose a valid time zone.')}
}
