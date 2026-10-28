import * as chrono from 'chrono-node';
import {localParts} from './availability.ts';
export type Source={id:string;kind:'request'|'history';text:string;at:number};
export type Candidate<T>={id:string;source:string;kind:Source['kind'];at:number;evidence:string;value:T};
export type DateValue={start:string;end:string;alternative?:string};
export type WindowValue={mode:'between'|'before'|'after'|'at'|'any';start?:string;end?:string;ambiguous?:boolean;implicitToday?:boolean;implicitDate?:string};
export type Candidates={dates:Candidate<DateValue>[];windows:Candidate<WindowValue>[];durations:Candidate<number>[];titles:Candidate<string>[];zones:Candidate<string>[]};
const pad=(n:number)=>String(n).padStart(2,'0');
const dateOf=(c:chrono.ParsedComponents)=>`${c.get('year')}-${pad(c.get('month')!)}-${pad(c.get('day')!)}`;
const addDays=(day:string,n:number)=>new Date(Date.parse(day+'T12:00Z')+n*86400000).toISOString().slice(0,10);
const numberWords:Record<string,number>={a:1,an:1,one:1,two:2,three:3,four:4,five:5,ten:10,fifteen:15,twenty:20,thirty:30,'forty-five':45,'forty five':45,sixty:60,ninety:90,half:.5,quarter:.25};
export function encodeSlackRequest(text:string,at:number){return JSON.stringify({wharfRequest:true,text:text.slice(0,4000),at})}
export function requestSources(text:string,background:string,now:number):Source[]{
 const requests=text.split('\nFollow-up: ').filter(s=>!s.startsWith('Wharf asked:')).map((text,i)=>{
  let at=now;
  try{const m=JSON.parse(text);if(m.wharfRequest===true&&typeof m.text==='string'&&Number.isFinite(m.at)){text=m.text;at=m.at}}catch{}
  return {id:`request${i}`,kind:'request' as const,text:text.slice(0,4000),at};
 });
 const history=background.split('\n').flatMap((line,i)=>{try{const m=JSON.parse(line);return typeof m.text==='string'&&Number.isFinite(Date.parse(m.at))?[{id:`history${i}`,kind:'history' as const,text:m.text,at:Date.parse(m.at)}]:[]}catch{return []}});
 return [...history.slice(-12),...requests];
}
export function schedulingCandidates(sources:Source[],timezone:string):Candidates{
 const result:Candidates={dates:[],windows:[],durations:[],titles:[],zones:[]};
 for(const source of sources){
  const {text}=source,local=localParts(source.at,timezone);
  const add=<K extends keyof Candidates>(key:K,evidence:string,value:Candidates[K][number]['value'])=>{
   (result[key] as Candidate<any>[]).push({id:`${key}${result[key].length}`,source:source.id,kind:source.kind,at:source.at,evidence,value});
  };
  const zones:[RegExp,string][]=[[/\b(?:Pacific(?: Time)?|PST|PDT|PT)\b/gi,'America/Los_Angeles'],[/\b(?:Mountain(?: Time)?|MST|MDT|MT)\b/gi,'America/Denver'],[/\b(?:Eastern(?: Time)?|EST|EDT|ET)\b/gi,'America/New_York'],[/\bCentral Time\b/gi,'America/Chicago'],[/\b(?:UTC|GMT)\b/g,'UTC']];
  for(const m of text.matchAll(/\b[A-Z][a-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?\b/g))try{new Intl.DateTimeFormat('en',{timeZone:m[0]});add('zones',m[0],m[0])}catch{}
  for(const [pattern,value] of zones)for(const m of text.matchAll(pattern))add('zones',m[0],value);
  const durationPattern=/\b(\d+(?:\.\d+)?|forty[- ]five|fifteen|twenty|thirty|sixty|ninety|one|two|three|four|five|ten|an?|half|quarter)\s*(?:-\s*)?(?:of\s+)?(?:an?\s+)?(minutes?|mins?|hours?|hrs?)\b/gi;
  let dateText=text;
  for(const m of text.matchAll(durationPattern)){
   const number=Number(m[1])||numberWords[m[1].toLowerCase()],value=number*(/^h/i.test(m[2])?60:1);
   if(Number.isInteger(value))add('durations',m[0],value);
   dateText=dateText.replace(m[0],' '.repeat(m[0].length));
  }
  // Parse human date spans in wall-clock time, not the server's timezone.
  const parsed=chrono.parse(dateText,{instant:new Date(`${local.date}T${local.time}:00Z`),timezone:0},{forwardDate:true});
  for(const p of parsed){
   if(!p.start.isCertain('day')&&!p.start.isCertain('weekday'))continue;
   let start=dateOf(p.start),end=p.end?dateOf(p.end):start,alternative:string|undefined;
   const weekday=p.start.get('weekday');
   if(p.start.isCertain('weekday')&&weekday!==null){
    const day=new Date(local.date+'T12:00Z').getUTCDay(),coming=addDays(local.date,(weekday-day+7)%7);
    if(/\bnext\b/i.test(p.text)){
     start=addDays(local.date,7-((day+6)%7)+(weekday+6)%7);
     if(start!==coming)alternative=coming;
    }else start=coming;
    if(!p.end)end=start;
    else if(p.end.isCertain('weekday')&&!p.end.isCertain('day'))end=addDays(start,(p.end.get('weekday')!-new Date(start+'T12:00Z').getUTCDay()+7)%7);
   }
   if(/\bnext week\b/i.test(p.text)){
    const day=new Date(local.date+'T12:00Z').getUTCDay();start=addDays(local.date,7-((day+6)%7));end=addDays(start,4);
   }
   add('dates',p.text,{start,end,...(alternative?{alternative}:{})});
  }
  // Clock spans stay literal. Unsupported/ambiguous wording is clarified, never guessed.
  const clockPattern=/\b(?:\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?|(?:[01]?\d|2[0-4]):[0-5]\d|noon|midnight)\b/gi;
  const clocks=[...dateText.matchAll(clockPattern)].map(m=>{
   const raw=m[0].toLowerCase().replace(/\./g,'').replace(/\s/g,'');
   if(raw==='noon'||raw==='midnight')return {raw:m[0],index:m.index!,time:raw==='noon'?'12:00':'24:00'};
   const parts=raw.match(/^(\d{1,2})(?::(\d{2}))?([ap]m)?$/)!;
   let h=Number(parts[1]);if(parts[3])h=h%12+(parts[3]==='pm'?12:0);
   return {raw:m[0],index:m.index!,time:`${pad(h)}:${parts[2]||'00'}`};
  });
  for(let i=0;i<clocks.length;i++){
   const c=clocks[i];
   const prefix=dateText.slice(Math.max(0,c.index-70),c.index).split(/[.!?;\n]/).at(-1)||'';
   const modeHint=/\b(before|by|until|no later than)\b/i.test(prefix)?'before':/\b(after|from|no earlier than)\b/i.test(prefix)?'after':null;
   for(const mode of (modeHint?[modeHint]:['before','after','at']) as ('before'|'after'|'at')[])add('windows',`${mode} ${c.raw}`,{mode,...(mode==='before'?{end:c.time}:{start:c.time}),implicitToday:mode!=='at',...(mode!=='at'?{implicitDate:local.date}:{})});
   const next=clocks[i+1];
   if(next)add('windows',`${c.raw} to ${next.raw}`,{mode:'between',start:c.time==='24:00'?'00:00':c.time,end:next.time});
  }
  // Chrono also recognizes abbreviated ranges such as "9 to 5pm".
  for(const p of parsed){
   if(!p.end||!p.start.isCertain('hour')||!p.end.isCertain('hour'))continue;
   const time=(c:chrono.ParsedComponents)=>`${pad(c.get('hour')!)}:${pad(c.get('minute')||0)}`;
   let start=time(p.start),end=time(p.end);
   if(start>=end&&!p.start.isCertain('meridiem')&&p.start.get('hour')!>=12)start=`${pad(p.start.get('hour')!-12)}:${pad(p.start.get('minute')||0)}`;
   if(!/midnight/i.test(p.text))add('windows',p.text,{mode:'between',start,end,ambiguous:!/[ap]\.?m\.?|\b(?:[01]\d|2[0-3]):\d{2}/i.test(p.text)});
  }
  const generic:[RegExp,string,WindowValue][]=[
   [/\b(any\s*time|whenever|sometime|some time|all day|any point|any hour|later today)\b/i,'any time',{mode:'any'}],
   [/\b(workday|business hours|working hours|office hours)\b/i,'workday',{mode:'between',start:'09:00',end:'17:00'}],
   [/\b(lunch|lunchtime|lunch time)\b/i,'lunchtime',{mode:'between',start:'11:30',end:'14:30'}],
   [/\b(evening|tonight)\b/i,'evening',{mode:'between',start:'17:00',end:'22:00'}],
   [/\bmorning\b/i,'morning',{mode:'between',start:'05:00',end:'12:00'}],
   [/\bafternoon\b/i,'afternoon',{mode:'between',start:'12:00',end:'17:00'}]
  ];
  for(const [pattern,label,value] of generic)if(pattern.test(text))add('windows',label,value);
  for(const m of text.matchAll(/\b(?:call (?:it|the meeting)|(?:meeting )?(?:called|named|titled)|name (?:it|the meeting))\s+["“]?([^"”\n,.!?]{1,100})/gi))add('titles',m[0],m[1].trim());
 }
 for(const key of Object.keys(result) as (keyof Candidates)[]){
  // Equal values from multiple spans otherwise split the choice probability. Prefer direct evidence.
  const values=new Map<string,Candidate<any>>();
  for(const candidate of result[key]){
   const value=JSON.stringify(candidate.value),prior=values.get(value);
   if(!prior||candidate.kind==='request'||prior.kind==='history')values.set(value,candidate);
  }
  result[key]=[...values.values()].slice(-180) as never;
 }
 return result;
}
