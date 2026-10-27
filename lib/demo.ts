import {allowed,localParts,type Constraints} from './availability.ts';
export function samplePeople(c:Constraints){const slots=allowed(c);return ['Ray Shaw','Dave Grow','Seamus Hennessy','Ben Dilts'].map((name,index)=>({name,sample:true,busy:slots.flatMap((w,d)=>{const hrs=index===0?[[1.5,2.5],[5,6]]:index===1?[[0,0.5],[2.5,3],[4.5,5]]:index===2?[[1,2],[4,4.5]]:[[0,1.5],[5.5,6.5]];return hrs.map(([a,b])=>({start:Math.min(w.end,w.start+(a+(d%2)*.5)*3600000),end:Math.min(w.end,w.start+(b+(d%2)*.5)*3600000)}))})}))}

// The example is independent of the last live meeting or unfinished form.
export function demoConstraints(zone='America/Denver',now=Date.now()):Constraints{
 const today=new Date(localParts(now,zone).date+'T12:00:00Z');
 const offset=(8-today.getUTCDay())%7||7;
 today.setUTCDate(today.getUTCDate()+offset);
 const start=today.toISOString().slice(0,10);
 today.setUTCDate(today.getUTCDate()+4);
 return {title:'lucid demo',start,end:today.toISOString().slice(0,10),duration:30,zone,from:'09:00',to:'17:00',days:[1,2,3,4,5]};
}
