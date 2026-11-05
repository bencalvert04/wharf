'use client';
import {Fragment,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import * as chrono from 'chrono-node';
import {AtSign,ChevronDown,Eye,Hash,MessagesSquare,Plus,RotateCcw,Search,SendHorizontal,Smile} from 'lucide-react';
import styles from '@/app/slack/slack.module.css';

/*
 * A scripted, browser-only imitation of Wharf in Slack. Bot wording mirrors the
 * real messages in lib/slack-connect-prompt.ts, lib/slack-slot-prompt.ts,
 * lib/slack-booking-notice-text.ts, and lib/slack-attendance.ts.
 */

type ChannelId='general'|'design-sync'|'launch-plan'|'random'|'wharf';
type UserId='you'|'maya'|'jon'|'priya'|'sam';
type Reaction={emoji:string;count:number;mine:boolean};
type Request={date:Date;endDate?:Date;windowStart:number;windowEnd:number;duration:number;exact:boolean};
type Draft={duration?:number;date?:Date;endDate?:Date;windowStart?:number;windowEnd?:number;exact?:boolean;ambiguous?:{hour:number;minute:number;kind:'at'|'before'|'after'}};
type Choice={label:string;patch:Partial<Draft>};
type Message={id:number;time:string}&(
 {kind:'divider';label:string}|
 {kind:'text';user:UserId;text:string;reactions?:Reaction[]}|
 {kind:'system';text:string}|
 {kind:'bot';text:string;reactions?:Reaction[]}|
 {kind:'connect';request:Request;linked:boolean}|
 {kind:'attending'}|
 {kind:'slot';request:Request;chosen:number;showOptions:boolean;status:'open'|'booking'|'booked'}|
 {kind:'invite';status:'open'|'invited'|'dismissed'}|
 {kind:'ask';question:string;choices:Choice[];draft:Draft;answer?:string}|
 {kind:'help'}
);
type NewMessage=Message extends infer M?M extends Message?Omit<M,'id'|'time'>:never:never;
type Channel={messages:Message[];member:boolean;unread:boolean};
type Workspace=Record<ChannelId,Channel>;

const USERS:Record<UserId,{name:string;color:string}>={
 you:{name:'You',color:'#2563eb'},maya:{name:'Maya Chen',color:'#7c3aed'},jon:{name:'Jon Park',color:'#0e7490'},
 priya:{name:'Priya Shah',color:'#c2410c'},sam:{name:'Sam Rivera',color:'#15803d'},
};
const CHANNELS:{id:Exclude<ChannelId,'wharf'>;members:number;topic:string}[]=[
 {id:'general',members:48,topic:'Company-wide announcements'},
 {id:'design-sync',members:5,topic:'Design reviews and critiques'},
 {id:'launch-plan',members:4,topic:'Q1 launch coordination'},
 {id:'random',members:31,topic:'Non-work banter'},
];
const SUGGESTIONS=['@Wharf find 45 minutes Friday morning','@Wharf book an hour Thursday at 2pm'];
const WEEKDAYS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

/* Date and time formatting, matching the shapes Wharf posts. */
const zone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone;
const dayFrom=(offset:number)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+offset);return d};
const shortDay=(d:Date)=>d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
const hourLabel=(m:number)=>m>=1440?'midnight':`${Math.floor(m/60)%12||12}${m%60?':'+String(m%60).padStart(2,'0'):''} ${m<720?'AM':'PM'}`;
const clockLabel=(m:number)=>`${Math.floor(m/60)%12||12}:${String(m%60).padStart(2,'0')} ${m<720?'AM':'PM'}`;
const at=(d:Date,m:number)=>{const x=new Date(d);x.setMinutes(m);return x};
function dividerLabel(offset:number){
 if(offset===0)return 'Today';if(offset===-1)return 'Yesterday';
 const d=dayFrom(offset),n=d.getDate(),suffix=n%10===1&&n!==11?'st':n%10===2&&n!==12?'nd':n%10===3&&n!==13?'rd':'th';
 return `${d.toLocaleDateString('en-US',{weekday:'long'})}, ${d.toLocaleDateString('en-US',{month:'long'})} ${n}${suffix}`;
}
const when=(r:Request)=>r.endDate?`between ${hourLabel(r.windowStart)} and ${hourLabel(r.windowEnd)} each day from ${shortDay(r.date)} to ${shortDay(r.endDate)}`:`between ${hourLabel(r.windowStart)} and ${hourLabel(r.windowEnd)} on ${shortDay(r.date)}`;
const onItText=(r:Request)=>`I’m on it. Planning a ${r.duration}-minute meeting ${when(r)} (${zone()}). I’ll check everyone’s calendars to find a time that works.`;
const slotTimes=(r:Request)=>{
 // Sample calendars: the earliest shared opening is around 9:30 AM, or the window start if later.
 const first=r.exact?r.windowStart:Math.min(roundUp(Math.max(r.windowStart,570)),r.windowEnd-r.duration);
 return [0,30,60].map(step=>first+step).filter(start=>start+r.duration<=r.windowEnd||start===first);
};
const slotText=(r:Request,start:number)=>`Looks like ${shortDay(r.date)}, ${clockLabel(start)} to ${clockLabel(start+r.duration)} (${zone()}) is free.`;
function bookedText(r:Request,start:number){
 const f=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
 return `It’s booked! We’re meeting ${f.formatRange(at(r.date,start),at(r.date,start+r.duration))}. Calendar invites have been sent to everyone attending.`;
}

/*
 * Browser-side interpreter following the rules the real bot gives Claude in
 * lib/slack-agent.ts and the checks in lib/slack-clarification.ts: never invent
 * a duration, ask for a missing day or time range, ask about AM/PM for bare
 * hours, and default a day-only request to 5 AM – 11 PM.
 */
const WORDS:Record<string,number>={a:1,an:1,one:1,two:2,three:3,four:4,fifteen:15,twenty:20,thirty:30,'forty-five':45,'forty five':45,sixty:60,ninety:90};
const TIME=String.raw`\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?|noon|midnight`;
function readDuration(t:string):[number|undefined,string]{
 const quarter=t.match(/\bquarter[ -](?:of[ -])?(?:an? )?hour\b/),half=t.match(/\bhalf[ -](?:an? )?hour\b/);
 if(quarter)return [15,t.replace(quarter[0],' ')];
 if(half)return [30,t.replace(half[0],' ')];
 const m=t.match(/\b(?:for\s+)?(\d+(?:\.\d+)?|an?|one|two|three|four|fifteen|twenty|thirty|forty[- ]five|sixty|ninety)\s*-?\s*(minutes?|mins?|m\b|hours?|hrs?|h\b)/);
 if(!m)return [undefined,t];
 const n=WORDS[m[1]]??+m[1],minutes=/^h/.test(m[2])?n*60:n;
 return [Math.round(minutes),t.replace(m[0],' ')];
}
type Clock={minutes:number;certain:boolean};
function clockTime(raw:string,fallbackMeridiem?:string):Clock|null{
 const v=raw.trim();
 if(v==='noon')return {minutes:720,certain:true};if(v==='midnight')return {minutes:1440,certain:true};
 const m=v.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/);if(!m)return null;
 let h=+m[1];const min=+(m[2]||0),mer=(m[3]||fallbackMeridiem||'').replace(/\./g,'');
 if(h>23||min>59)return null;
 if(mer){if(h>12||h===0)return null;h=h%12+(mer==='pm'?12:0);return {minutes:h*60+min,certain:true}}
 return {minutes:h*60+min,certain:h===0||h>12||!!m[2]&&h>12};
}
const ambiguity=(c:Clock,kind:'at'|'before'|'after')=>({hour:Math.floor(c.minutes/60),minute:c.minutes%60,kind});
function interpret(text:string):{help:true}|{draft:Draft}{
 let t=` ${text.toLowerCase().replace(/@wharf/g,' ').replace(/[–—]/g,'-')} `;
 const draft:Draft={};
 const [mins,rest]=readDuration(t);t=rest;
 if(mins)draft.duration=Math.min(Math.max(mins,5),480);
 const period=/\bmorning\b/.test(t)?[480,720]:/\b(lunch|lunchtime)\b/.test(t)?[690,870]:/\bafternoon\b/.test(t)?[720,1020]:/\b(evening|tonight)\b/.test(t)?[1020,1380]:/\b(workday|business hours|work hours)\b/.test(t)?[540,1020]:null;
 const pmHint=period&&period[0]>=720?'pm':undefined;
 const range=t.match(new RegExp(String.raw`(?:\b(?:between|from)\s+)?(${TIME})\s*(?:-|to|and|until)\s*(${TIME})`));
 const before=t.match(new RegExp(String.raw`\b(?:before|by|until)\s+(${TIME})`));
 const after=t.match(new RegExp(String.raw`\bafter\s+(${TIME})`));
 const single=t.match(new RegExp(String.raw`\bat\s+(${TIME})|\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))|\b(noon)\b`));
 const realRange=range&&(/between|from|[ap]\.?m|noon|:/.test(range[0])||/\d\s*-\s*\d/.test(range[0]));
 if(realRange&&range){
  const endMer=range[2].match(/([ap])\.?m/)?.[1];
  const end=clockTime(range[2],pmHint),start=clockTime(range[1],endMer?endMer+'m':pmHint);
  if(start&&end){
   if(!end.certain)draft.ambiguous=ambiguity(end,'before');
   else{draft.windowStart=start.minutes>end.minutes?start.minutes-720:start.minutes;draft.windowEnd=end.minutes}
   if(!end.certain)draft.windowStart=start.minutes;
  }
  t=t.replace(range[0],' ');
 }else if(before){
  const c=clockTime(before[1],pmHint);
  if(c){if(c.certain)draft.windowEnd=c.minutes;else draft.ambiguous=ambiguity(c,'before')}
  t=t.replace(before[0],' ');
 }else if(after){
  const c=clockTime(after[1],pmHint);
  if(c){if(c.certain){draft.windowStart=c.minutes;draft.windowEnd=1380}else draft.ambiguous=ambiguity(c,'after')}
  t=t.replace(after[0],' ');
 }else if(single){
  const raw=single[1]||single[2]||single[3];
  const c=raw?clockTime(raw,pmHint):null;
  if(c){if(c.certain){draft.windowStart=c.minutes;draft.exact=true}else draft.ambiguous=ambiguity(c,'at')}
  t=t.replace(single[0],' ');
 }
 if(period&&draft.windowStart===undefined&&draft.windowEnd===undefined&&!draft.ambiguous){draft.windowStart=period[0];draft.windowEnd=period[1]}
 if(/\bnext week\b/.test(t)){
  const monday=dayFrom((8-new Date().getDay())%7||7),friday=new Date(monday);friday.setDate(monday.getDate()+4);
  draft.date=monday;draft.endDate=friday;
 }else if(/\b(today|tonight|later)\b/.test(t))draft.date=dayFrom(0);
 else{
  const found=chrono.parse(t,new Date(),{forwardDate:true}).find(r=>r.start.isCertain('day')||r.start.isCertain('weekday'));
  if(found){const d=found.start.date();d.setHours(0,0,0,0);draft.date=d}
 }
 const scheduling=/\b(meet|meeting|schedule|book|find|time|call|sync|catch up|chat|review|1:1|standup|session|slot|available|free|plan)\b/.test(text.toLowerCase());
 const any=draft.duration||draft.date||draft.windowStart!==undefined||draft.windowEnd!==undefined||draft.ambiguous;
 if(!any&&!scheduling)return {help:true};
 return {draft};
}
const nowMinutes=()=>{const d=new Date();return d.getHours()*60+d.getMinutes()};
const roundUp=(m:number)=>Math.ceil(m/30)*30;
const isToday=(d:Date)=>d.getTime()===dayFrom(0).getTime();
/* Either a finished request or the single question Wharf would ask next. */
function resolve(d:Draft):{request:Request}|{question:string;choices:Choice[]}{
 if(d.ambiguous){
  const {hour,minute,kind}=d.ambiguous,label=(mer:string)=>`${hour%12||12}${minute?':'+String(minute).padStart(2,'0'):''} ${mer}`;
  const as=(minutes:number):Partial<Draft>=>kind==='at'?{windowStart:minutes,exact:true,ambiguous:undefined}:kind==='before'?{windowEnd:minutes,windowStart:d.windowStart!==undefined&&d.windowStart<minutes?d.windowStart:undefined,ambiguous:undefined}:{windowStart:minutes,windowEnd:1380,ambiguous:undefined};
  const am=(hour%12)*60+minute,pm=am+720;
  return {question:`Did you mean ${label('AM')} or ${label('PM')}?`,choices:[{label:label('AM'),patch:as(am)},{label:label('PM'),patch:as(pm)}]};
 }
 if(!d.duration)return {question:'How long should the meeting be?',choices:[15,30,45,60].map(n=>({label:n===60?'1 hour':`${n} minutes`,patch:{duration:n}}))};
 if(!d.date&&d.windowStart===undefined&&d.windowEnd===undefined)return {question:'What day and time range should I use?',choices:[
  {label:'Workday: 9am - 5pm',patch:{windowStart:540,windowEnd:1020}},{label:'Lunchtime: 11:30am - 2:30pm',patch:{windowStart:690,windowEnd:870}},
  {label:'Any-Time: 5:00am - 10:00pm',patch:{windowStart:300,windowEnd:1320}},{label:'Evening: 5pm - 10pm',patch:{windowStart:1020,windowEnd:1320}}]};
 const date=d.date||dayFrom(0);
 let windowStart=d.windowStart??300;
 let windowEnd=d.exact?windowStart+d.duration:d.windowEnd??1380;
 if(isToday(date)&&!d.exact)windowStart=Math.max(windowStart,roundUp(nowMinutes()+5));
 const tooLate=d.exact&&isToday(date)&&windowStart<nowMinutes();
 if(windowEnd-windowStart<d.duration||tooLate){
  const tomorrow=dayFrom(1);
  return {question:`No allowed time remains ${isToday(date)?'today':`on ${shortDay(date)}`}. Should I look on ${shortDay(tomorrow)} instead?`,choices:[
   {label:`Yes, ${shortDay(tomorrow)}`,patch:{date:tomorrow,endDate:undefined,...(d.exact?{}:{windowStart:d.windowStart,windowEnd:d.windowEnd})}},
   {label:'Any time tomorrow',patch:{date:tomorrow,endDate:undefined,windowStart:300,windowEnd:1380,exact:false}}]};
 }
 return {request:{date,endDate:d.endDate,windowStart,windowEnd,duration:d.duration,exact:!!d.exact}};
}

/* Seeded history. Times are fixed strings; dates are relative to today. */
function seed():Workspace{
 let id=1;
 const m=<T extends Omit<Message,'id'>>(message:T)=>({...message,id:id++}) as Message;
 const day=(offset:number)=>m({kind:'divider',time:'',label:dividerLabel(offset)});
 const say=(user:UserId,time:string,text:string,reactions?:Reaction[])=>m({kind:'text',user,time,text,reactions});
 const r=(emoji:string,count:number):Reaction=>({emoji,count,mine:false});
 const reviewDay=dayFrom(-3),review:Request={date:reviewDay,windowStart:720,windowEnd:1020,duration:45,exact:false};
 const launchDay=dayFrom(-2),launch:Request={date:dayFrom(2),windowStart:540,windowEnd:720,duration:60,exact:false};
 const today:Request={date:dayFrom(1),windowStart:720,windowEnd:1020,duration:30,exact:false};
 void reviewDay;void launchDay;
 return {
  general:{member:false,unread:true,messages:[
   day(-6),
   say('maya','9:02 AM','Please welcome @Sam Rivera to the team! Sam is joining design from Lisbon 🎉',[r('👋',14),r('🎉',9)]),
   say('sam','9:15 AM','Thanks everyone! Excited to be here.',[r('❤️',6)]),
   day(-1),
   say('jon','11:30 AM','Lunch & learn on Thursday at noon: “Writing for interfaces.” Pizza is on us 🍕',[r('🍕',11)]),
   day(0),
   say('priya','8:47 AM','Has anyone seen the good HDMI adapter?'),
   say('sam','8:52 AM','Third floor phone booth, as always',[r('😂',4)]),
  ]},
  'design-sync':{member:true,unread:false,messages:[
   day(-3),
   say('priya','9:14 AM','Uploaded the new onboarding flows to Figma. Would love eyes on the empty states 👀'),
   say('jon','9:20 AM','Looking now. The illustration on step 2 is great'),
   say('maya','9:31 AM','Can we review these together this week?'),
   say('priya','9:33 AM','@Wharf find 45 minutes Thursday afternoon'),
   m({kind:'bot',time:'9:33 AM',text:onItText(review)}),
   m({kind:'bot',time:'9:48 AM',text:bookedText(review,810),reactions:[r('🙌',3)]}),
   day(-1),
   say('sam','4:02 PM','Review notes are in the doc. Main open question is whether we keep the progress bar.'),
   say('maya','4:10 PM','Let’s do a follow-up once the prototype is ready'),
   say('jon','4:12 PM','Prototype should be up tomorrow morning 🙏'),
   day(0),
   say('jon','10:30 AM','Prototype is live! Link is pinned in the doc.',[r('🔥',4)]),
   say('you','10:42 AM','@Wharf schedule a 30 minute meeting tomorrow afternoon'),
   m({kind:'bot',time:'10:42 AM',text:onItText(today)}),
   m({kind:'connect',time:'10:42 AM',request:today,linked:false}),
  ]},
  'launch-plan':{member:true,unread:false,messages:[
   day(-2),
   say('sam','2:15 PM','Launch checklist v2 is up. Biggest risk is still the pricing page copy.'),
   say('maya','2:21 PM','I can take pricing. Want to walk through it together?'),
   say('sam','2:22 PM','@Wharf set up a 1 hour launch review Friday morning'),
   m({kind:'bot',time:'2:22 PM',text:onItText(launch)}),
   m({kind:'bot',time:'2:40 PM',text:bookedText(launch,570),reactions:[r('✅',3)]}),
   day(0),
   say('priya','9:05 AM','Press kit draft is ready for review 📎'),
   say('sam','9:11 AM','Nice. Adding it to the launch review agenda'),
  ]},
  random:{member:false,unread:true,messages:[
   day(-1),
   say('jon','5:40 PM','Who’s in for the climbing gym after work tomorrow?'),
   say('sam','5:41 PM','🙋'),
   say('priya','5:58 PM','I’ll belay but I will not be climbing'),
   day(0),
   say('maya','8:30 AM','My cat has chosen a new favorite box',[r('😻',7),r('📦',3)]),
   say('priya','8:33 AM','10/10 box'),
  ]},
  wharf:{member:true,unread:false,messages:[]},
 };
}

function rich(text:string):ReactNode{
 return text.split(/(@Wharf|@Sam Rivera|@Maya Chen)/i).map((part,i)=>/^@(wharf|sam rivera|maya chen)$/i.test(part)?<span key={i} className={styles.mention}>{part}</span>:part);
}
const now=()=>new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});

function Avatar({user}:{user:UserId|'wharf'|'slackbot'}){
 if(user==='wharf')return <img className={styles.avatar} src="/slack/wharf-avatar.png" alt="" width={36} height={36}/>;
 if(user==='slackbot')return <span className={`${styles.avatar} ${styles.slackbot}`}>💬</span>;
 return <span className={styles.avatar} style={{background:USERS[user].color}}>{USERS[user].name[0]}</span>;
}

export default function SlackDemo({fontClass}:{fontClass:string}){
 const [workspace,setWorkspace]=useState<Workspace|null>(null);
 const [active,setActive]=useState<ChannelId>('design-sync');
 const [linked,setLinked]=useState(false);
 const [draft,setDraft]=useState('');
 const [typing,setTyping]=useState<ChannelId|null>(null);
 const [busy,setBusy]=useState(false);
 const [tip,setTip]=useState(false);
 const scroller=useRef<HTMLDivElement>(null);
 const timers=useRef<number[]>([]);
 const nextId=useRef(1000);
 const jump=useRef(true);

 // Dates and time zones come from the visitor's browser, so build history after mount.
 useEffect(()=>{setWorkspace(seed());return()=>timers.current.forEach(clearTimeout)},[]);
 useEffect(()=>{
  const el=scroller.current;if(!el)return;
  if(jump.current){jump.current=false;el.scrollTop=el.scrollHeight;return}
  el.scrollTo({top:el.scrollHeight,behavior:'smooth'});
 },[workspace,typing,active]);

 const later=(ms:number,fn:()=>void)=>{timers.current.push(window.setTimeout(fn,ms))};
 const add=(channel:ChannelId,message:NewMessage)=>{
  const id=nextId.current++;
  setWorkspace(w=>w&&{...w,[channel]:{...w[channel],messages:[...w[channel].messages,{...message,id,time:now()} as Message],unread:w[channel].unread||channel!==activeRef.current}});
  return id;
 };
 const update=(channel:ChannelId,id:number,fn:(m:Message)=>Message)=>setWorkspace(w=>w&&{...w,[channel]:{...w[channel],messages:w[channel].messages.map(m=>m.id===id?fn(m):m)}});
 const activeRef=useRef(active);activeRef.current=active;

 function open(channel:ChannelId){
  jump.current=true;setActive(channel);setDraft('');
  setWorkspace(w=>w&&{...w,[channel]:{...w[channel],unread:false}});
 }

 function suggest(channel:ChannelId,request:Request){
  setTyping(channel);
  later(1100,()=>{setTyping(null);setBusy(false);add(channel,{kind:'slot',request,chosen:0,showOptions:false,status:'open'})});
 }

 function send(text:string,channel:ChannelId=active){
  const value=text.trim();
  if(!value||busy||!workspace||channel==='wharf')return;
  setDraft('');
  add(channel,{kind:'text',user:'you',text:value});
  if(!/@wharf/i.test(value)){setTip(true);return}
  setTip(false);
  if(!workspace[channel].member){later(600,()=>add(channel,{kind:'invite',status:'open'}));return}
  const result=interpret(value);
  setBusy(true);setTyping(channel);
  later(900,()=>{
   setTyping(null);
   if('help' in result){add(channel,{kind:'help'});setBusy(false);return}
   proceed(channel,result.draft);
  });
 }

 function proceed(channel:ChannelId,draft:Draft){
  const next=resolve(draft);
  if('question' in next){add(channel,{kind:'ask',question:next.question,choices:next.choices,draft});setBusy(false);return}
  const request=next.request;
  add(channel,{kind:'bot',text:onItText(request)});
  setBusy(true);
  if(linked){later(500,()=>{add(channel,{kind:'attending'});suggest(channel,request)})}
  else later(500,()=>{add(channel,{kind:'connect',request,linked:false});setBusy(false)});
 }

 function answer(channel:ChannelId,message:Extract<Message,{kind:'ask'}>,choice:Choice){
  if(message.answer||busy)return;
  update(channel,message.id,m=>m.kind==='ask'?{...m,answer:choice.label}:m);
  setBusy(true);setTyping(channel);
  later(700,()=>{setTyping(null);proceed(channel,{...message.draft,...choice.patch})});
 }

 function link(channel:ChannelId,id:number,request:Request){
  setLinked(true);setBusy(true);
  update(channel,id,m=>m.kind==='connect'?{...m,linked:true}:m);
  later(700,()=>{add(channel,{kind:'attending'});suggest(channel,request)});
 }

 function book(channel:ChannelId,message:Extract<Message,{kind:'slot'}>){
  if(message.status!=='open')return;
  update(channel,message.id,m=>m.kind==='slot'?{...m,status:'booking',showOptions:false}:m);
  setTyping(channel);
  later(1000,()=>{
   setTyping(null);
   update(channel,message.id,m=>m.kind==='slot'?{...m,status:'booked'}:m);
   add(channel,{kind:'bot',text:bookedText(message.request,slotTimes(message.request)[message.chosen])});
  });
 }

 function invite(channel:ChannelId,id:number,accept:boolean){
  update(channel,id,m=>m.kind==='invite'?{...m,status:accept?'invited':'dismissed'}:m);
  if(!accept)return;
  setWorkspace(w=>w&&{...w,[channel]:{...w[channel],member:true}});
  later(400,()=>add(channel,{kind:'system',text:`joined #${channel}.`}));
 }

 function react(channel:ChannelId,id:number,emoji:string){
  update(channel,id,m=>{
   if(m.kind!=='text'&&m.kind!=='bot')return m;
   const reactions=(m.reactions||[]).map(r=>r.emoji===emoji?{...r,count:r.count+(r.mine?-1:1),mine:!r.mine}:r).filter(r=>r.count>0);
   return {...m,reactions};
  });
 }

 function reset(){
  timers.current.forEach(clearTimeout);timers.current=[];
  jump.current=true;setTyping(null);setBusy(false);setTip(false);setDraft('');setLinked(false);setActive('design-sync');setWorkspace(seed());
 }

 const submit=(event:FormEvent)=>{event.preventDefault();send(draft)};

 function header(user:UserId|'wharf'|'slackbot',time:string,ephemeral=false){
  const name=user==='wharf'?'Wharf':user==='slackbot'?'Slackbot':USERS[user].name;
  return <>
   {ephemeral&&<p className={styles.onlyYou}><Eye size={12}/> Only visible to you</p>}
   <p className={styles.name}>{name}{user==='wharf'&&<span className={styles.appBadge}>APP</span>}<time>{time}</time></p>
  </>;
 }

 function reactionRow(channel:ChannelId,m:{id:number;reactions?:Reaction[]}){
  if(!m.reactions?.length)return null;
  return <p className={styles.reactions}>{m.reactions.map(r=><button type="button" key={r.emoji} className={r.mine?styles.reacted:undefined} aria-pressed={r.mine} onClick={()=>react(channel,m.id,r.emoji)}>{r.emoji} {r.count}</button>)}</p>;
 }

 function render(channel:ChannelId,m:Message,previous?:Message){
  if(m.kind==='divider')return <div key={m.id} className={styles.dayDivider}><span>{m.label}</span></div>;
  if(m.kind==='system')return <div key={m.id} className={styles.msg}><Avatar user="wharf"/><div>{header('wharf',m.time)}<p className={styles.systemText}>{m.text}</p></div></div>;
  if(m.kind==='text'){
   const grouped=previous?.kind==='text'&&previous.user===m.user&&previous.time===m.time;
   if(grouped)return <div key={m.id} className={`${styles.msg} ${styles.grouped}`}><time className={styles.gutterTime}>{m.time.replace(/ (AM|PM)$/,'')}</time><div className={styles.grow}><p>{rich(m.text)}</p>{reactionRow(channel,m)}</div></div>;
   return <div key={m.id} className={styles.msg}><Avatar user={m.user}/><div className={styles.grow}>{header(m.user,m.time)}<p>{rich(m.text)}</p>{reactionRow(channel,m)}</div></div>;
  }
  if(m.kind==='invite')return <div key={m.id} className={`${styles.msg} ${styles.ephemeral}`}><Avatar user="slackbot"/><div className={styles.grow}>
   {header('slackbot',m.time,true)}
   {m.status==='open'?<>
    <p>You mentioned <span className={styles.mention}>@Wharf</span>, but they’re not in this channel. Would you like to invite them to join?</p>
    <div className={styles.blockActions}><button type="button" className={styles.btnPrimary} onClick={()=>invite(channel,m.id,true)}>Invite Them</button><button type="button" className={styles.btnSecondary} onClick={()=>invite(channel,m.id,false)}>Do Nothing</button></div>
   </>:<p>{m.status==='invited'?<>OK! I’ve invited <span className={styles.mention}>@Wharf</span> to this channel. Mention it again to schedule.</>:'OK, I won’t invite them.'}</p>}
  </div></div>;
  if(m.kind==='help')return <div key={m.id} className={`${styles.msg} ${styles.ephemeral}`}><Avatar user="wharf"/><div className={styles.grow}>{header('wharf',m.time,true)}<p>Tell me when you want to meet, like “15 minutes sometime today.” I’ll include everyone here and help you choose a time privately.</p></div></div>;
  if(m.kind==='ask')return <div key={m.id} className={`${styles.msg} ${styles.ephemeral}`}><Avatar user="wharf"/><div className={styles.grow}>
   {header('wharf',m.time,true)}<p>{m.question}</p>
   {m.answer?<p className={styles.context}>You chose <b>{m.answer}</b></p>:<div className={styles.blockActions}>{m.choices.map(c=><button type="button" key={c.label} className={styles.btnSecondary} disabled={busy} onClick={()=>answer(channel,m,c)}>{c.label}</button>)}</div>}
  </div></div>;
  if(m.kind==='bot')return <div key={m.id} className={styles.msg}><Avatar user="wharf"/><div className={styles.grow}>{header('wharf',m.time)}<p>{m.text}</p>{reactionRow(channel,m)}</div></div>;
  if(m.kind==='attending')return <div key={m.id} className={`${styles.msg} ${styles.ephemeral}`}><Avatar user="wharf"/><div className={styles.grow}>{header('wharf',m.time,true)}<p>You’re attending. Your Google calendar availability has been added to this meeting.</p></div></div>;
  if(m.kind==='connect'){
   const r=m.request;
   return <div key={m.id} className={`${styles.msg} ${styles.ephemeral}`}><Avatar user="wharf"/><div className={styles.grow}>
    {header('wharf',m.time,true)}
    <p>I’m on it. Planning a {r.duration}-minute meeting {when(r)} ({zone()}). I’ll check everyone’s calendars to find a time that works.</p>
    <p className={styles.blockGap}>You’ve been included in this meeting. Please link your Google Calendar. Future meetings in this conversation will include your availability automatically.</p>
    {m.linked?<p className={styles.context}>✅ Google Calendar linked</p>:<div className={styles.blockActions}><button type="button" className={`${styles.btnSecondary} ${styles.pulse}`} onClick={()=>link(channel,m.id,r)} disabled={busy}>Link Google Calendar</button></div>}
   </div></div>;
  }
  const times=slotTimes(m.request);
  return <div key={m.id} className={`${styles.msg} ${styles.ephemeral}`}><Avatar user="wharf"/><div className={styles.grow}>
   {header('wharf',m.time,true)}
   <p>{slotText(m.request,times[m.chosen])}</p>
   {m.status==='open'&&<div className={styles.blockActions}>
    <button type="button" className={`${styles.btnPrimary} ${styles.pulse}`} onClick={()=>book(channel,m)}>Book meeting</button>
    <button type="button" className={styles.btnSecondary} aria-expanded={m.showOptions} onClick={()=>update(channel,m.id,x=>x.kind==='slot'?{...x,showOptions:!x.showOptions}:x)}>View Other Times <ChevronDown size={13}/></button>
   </div>}
   {m.showOptions&&m.status==='open'&&<div className={styles.optionList} role="group" aria-label="Other times">
    {times.map((start,i)=><button type="button" key={start} className={i===m.chosen?styles.optionChosen:undefined} aria-pressed={i===m.chosen} onClick={()=>update(channel,m.id,x=>x.kind==='slot'?{...x,chosen:i,showOptions:false}:x)}>{shortDay(m.request.date)}, {clockLabel(start)} to {clockLabel(start+m.request.duration)}</button>)}
   </div>}
   {m.status==='booking'&&<p className={styles.context}>Booking…</p>}
   {m.status==='booked'&&<p className={styles.context}>✅ Booked</p>}
  </div></div>;
 }

 const channel=workspace?.[active];
 const meta=CHANNELS.find(c=>c.id===active);
 const isApp=active==='wharf';
 const sideButton=(id:ChannelId,label:ReactNode)=><button type="button" key={id} className={`${styles.sideItem} ${active===id?styles.activeChannel:''} ${workspace?.[id].unread&&active!==id?styles.unread:''}`} aria-current={active===id?'page':undefined} onClick={()=>open(id)}>{label}</button>;

 return <div className={styles.demo}>
  <div className={`${styles.slack} ${fontClass}`} role="region" aria-label="Interactive Wharf for Slack demo">
   <div className={styles.titlebar} aria-hidden="true">
    <span className={styles.lights}><i/><i/><i/></span>
    <span className={styles.search}><Search size={12}/>Search Northwind</span>
   </div>
   <div className={styles.workspace}>
    <nav className={styles.sidebar} aria-label="Demo channels">
     <p className={styles.team}>Northwind <ChevronDown size={13}/></p>
     <p className={`${styles.sideItem} ${styles.sideStatic}`}><MessagesSquare size={15}/>Threads</p>
     <p className={`${styles.sideItem} ${styles.sideStatic}`}><AtSign size={15}/>Mentions &amp; reactions</p>
     <p className={styles.sideHeading}><ChevronDown size={12}/>Channels</p>
     {CHANNELS.map(c=>sideButton(c.id,<><Hash size={15}/>{c.id}</>))}
     <p className={styles.sideHeading}><ChevronDown size={12}/>Apps</p>
     {sideButton('wharf',<><img className={styles.appIcon} src="/slack/wharf-avatar.png" alt="" width={18} height={18}/>Wharf</>)}
    </nav>
    <div className={styles.channel}>
     <div className={styles.mobileTabs} role="tablist" aria-label="Demo channels">
      {CHANNELS.map(c=><button key={c.id} type="button" role="tab" aria-selected={active===c.id} onClick={()=>open(c.id)} className={active===c.id?styles.mobileTabActive:workspace?.[c.id].unread?styles.unread:undefined}>#{c.id}</button>)}
     </div>
     <div className={styles.channelHead}>
      {isApp?<strong><img className={styles.headAvatar} src="/slack/wharf-avatar.png" alt="" width={22} height={22}/>Wharf <ChevronDown size={13}/></strong>:<strong><Hash size={17}/>{active} <ChevronDown size={13}/></strong>}
      {!isApp&&meta&&<span className={styles.headRight}><span className={styles.topic}>{meta.topic}</span><span className={styles.members} aria-label={`${meta.members} members`}><i style={{background:'#7c3aed'}}/><i style={{background:'#0e7490'}}/><i style={{background:'#c2410c'}}/>{meta.members}</span></span>}
     </div>
     <div className={styles.messages} ref={scroller} aria-live="polite">
      {isApp?<div className={styles.appIntro}>
       <img src="/slack/wharf-avatar.png" alt="" width={72} height={72}/>
       <p className={styles.appIntroName}>Wharf <span className={styles.appBadge}>APP</span></p>
       <p>Find a shared meeting time and send calendar invitations.</p>
       <p className={styles.context}>Wharf works in public channels and group DMs. Add it to a conversation and mention <span className={styles.mention}>@Wharf</span> with a day, time window, and duration.</p>
       <div className={styles.blockActions}><a href="/api/slack/install" className={styles.btnPrimary}>Add Wharf to your Slack</a></div>
      </div>:channel&&<>
       <div className={styles.channelIntro}><p className={styles.channelIntroTitle}><Hash size={20}/>{active}</p><p>This is the very beginning of the <b>#{active}</b> channel. {meta?.topic}.</p></div>
       {channel.messages.map((m,i)=><Fragment key={m.id}>{render(active,m,channel.messages[i-1])}</Fragment>)}
      </>}
     </div>
     <form className={styles.composer} onSubmit={submit}>
      <div className={`${styles.composerBox} ${isApp?styles.composerDisabled:''}`}>
       {isApp?<p className={styles.disabledNote}>Sending messages to this app has been turned off.</p>:<input value={draft} onChange={e=>setDraft(e.target.value)} placeholder={`Message #${active}`} aria-label={`Message #${active}`}/>}
       <div className={styles.composerTools}>
        <Plus size={15} aria-hidden="true"/><span aria-hidden="true">Aa</span><Smile size={15} aria-hidden="true"/>
        <button type="button" className={styles.toolButton} aria-label="Mention Wharf" disabled={isApp} onClick={()=>setDraft(d=>/@wharf/i.test(d)?d:`@Wharf ${d}`)}><AtSign size={15}/></button>
        <button type="submit" className={styles.send} aria-label="Send message" disabled={isApp||!draft.trim()||busy}><SendHorizontal size={15}/></button>
       </div>
      </div>
      <p className={styles.typing} aria-live="polite">{typing===active?<><span className={styles.typingDots}><i/><i/><i/></span><b>Wharf</b> is typing…</>:tip&&!isApp?<span>Wharf only replies when you mention it. Start your message with <b>@Wharf</b>.</span>:'\u00a0'}</p>
     </form>
    </div>
   </div>
  </div>
  <div className={styles.tryRow}>
   <span>Try it:</span>
   {SUGGESTIONS.map(s=><button key={s} type="button" className={styles.chip} disabled={busy} onClick={()=>{const target=active==='wharf'?'design-sync':active;if(target!==active)open(target);send(s,target)}}>{s.replace('@Wharf ','')}</button>)}
   <button type="button" className={styles.resetButton} onClick={reset}><RotateCcw size={13}/> Reset</button>
  </div>
  <p className={styles.demoNote}>Interactive preview. No messages are sent and no calendars are connected.</p>
 </div>;
}
