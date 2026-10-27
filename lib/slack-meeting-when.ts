export function slackMeetingWhen(d:{startDate:string;endDate?:string;dayStart:string;dayEnd:string;timezone:string;windowMode?:string;weekdays?:number[]},conversational=false){
 const date=(value:string)=>new Date(value+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'});
 const time=(value:string)=>{const [h,m]=value.split(':').map(Number);return h===24?'midnight':`${h%12||12}${m?':'+String(m).padStart(2,'0'):''} ${h<12?'AM':'PM'}`};
 const end=d.endDate||d.startDate;
 const days=end===d.startDate?date(d.startDate):`${date(d.startDate)} – ${date(end)}`;
 const window=d.windowMode==='continuous'&&end!==d.startDate?`${date(d.startDate)}, ${time(d.dayStart)} → ${date(end)}, ${time(d.dayEnd)}`:`${days} · ${time(d.dayStart)}–${time(d.dayEnd)}${end!==d.startDate?' each day':''}`;
 const weekdays=d.windowMode!=='continuous'&&end!==d.startDate&&d.weekdays?.length&&d.weekdays.length<7?` · ${d.weekdays.map(day=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]).join(', ')}`:'';
 if(conversational){
  const period=end===d.startDate?`between ${time(d.dayStart)} and ${time(d.dayEnd)} on ${date(d.startDate)}`:
   d.windowMode==='continuous'?`between ${time(d.dayStart)} on ${date(d.startDate)} and ${time(d.dayEnd)} on ${date(end)}`:
   `between ${time(d.dayStart)} and ${time(d.dayEnd)} each day from ${date(d.startDate)} to ${date(end)}${weekdays}`;
  return `${period} (${d.timezone})`;
 }
 return `${window}${weekdays} (${d.timezone})`;
}
