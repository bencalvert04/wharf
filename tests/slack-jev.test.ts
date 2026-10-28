import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeSlackRequest,requestSources,schedulingCandidates,type Candidates} from '../lib/slack-jev-candidates.ts';
import {jevQuestions,resolveJev,interpretJev,shortSlackReply,normalizeSchedulingShorthand} from '../lib/slack-jev.ts';
import {askJev,type JevAnswer} from '../lib/jev-client.ts';
import {allowed} from '../lib/availability.ts';
import {toConstraints,createMeetingSchema} from '../lib/agent-contract.ts';
const now=Date.parse('2026-10-26T20:00Z'),zone='America/Denver';
const choice=(value:string,p=1):JevAnswer=>({type:'choice',choice:value,probabilities:{[value]:p}});
function fixture(text:string,history=''){
 const c=schedulingCandidates(requestSources(text,history,now),zone);
 const a:Record<string,JevAnswer>={intent:choice('schedule'),bookAuthorization:{type:'noul',noul:1},duration:choice(c.durations[0]?.id||'none'),date:choice(c.dates[0]?.id||'none'),window:choice(c.windows[0]?.id||'none'),title:choice('none'),timezone:choice('none'),weekdays:{type:'noul',noul:0},continuous:{type:'noul',noul:0}};
 return {c,a,resolve:()=>resolveJev(a,c,zone,now)};
}
test('literal candidates preserve duration, dates, overnight limits and exact deadlines',()=>{
 let f=fixture('15 minutes before tomorrow at 6 pm');
 const d=createMeetingSchema.parse(f.resolve().draft);
 assert.equal(d.durationMinutes,15);assert.equal(d.windowMode,'continuous');
 assert.equal(d.dayStart,'14:00');assert.equal(d.dayEnd,'18:00');assert.equal(d.endDate,'2026-10-27');
 assert.deepEqual(allowed(toConstraints(d)).map(s=>[new Date(s.start).toISOString(),new Date(s.end).toISOString()]),[
 ['2026-10-26T20:00:00.000Z','2026-10-27T05:00:00.000Z'],['2026-10-27T11:00:00.000Z','2026-10-28T00:00:00.000Z']]);
 f=fixture('15 minutes after 8 pm');assert.equal(f.resolve().draft?.dayStart,'20:00');assert.equal(f.resolve().draft?.dayEnd,'23:00');
 f=fixture('Fine, 15 minutes. We can meet sometime today.');assert.equal(f.resolve().draft?.dayEnd,'23:00');
});
test('absence and uncertainty never silently fill in required details',()=>{
 for(const [text,question] of [['meet sometime today','How long'],['15 minutes tomorrow','Between what'],['15 minutes','What day']] as const){const f=fixture(text);assert.equal(f.resolve().draft,undefined);assert.match(f.resolve().question!,new RegExp(question))}
 const f=fixture('15 minutes anytime tomorrow');f.a.duration=choice(f.c.durations[0].id,.4);assert.equal(f.resolve().draft,undefined);
 f.a.intent=choice('other');assert.equal(f.resolve().intent,'other');assert.equal(f.resolve().draft,undefined);
});
test('history-only details require confirmation, direct follow-ups do not',()=>{
 const history=JSON.stringify({at:'2026-10-25T18:00Z',author:'synthetic',text:'Let us meet tomorrow between 9am and 5pm for 30 minutes.'});
 const f=fixture('Please arrange that meeting.',history);f.a.window=choice(f.c.windows.find(x=>x.value.mode==='between')!.id);
 const result=f.resolve();assert.equal(result.confirmation,true);assert.equal(result.draft?.startDate,'2026-10-26');
 const direct=fixture('15 minutes sometime today\nFollow-up: Wharf asked: How long?\nFollow-up: Actually 30 minutes');
 direct.a.duration=choice(direct.c.durations.find(x=>x.value===30)!.id);assert.equal(direct.resolve().confirmation,false);assert.equal(direct.resolve().draft?.durationMinutes,30);
 const mixed=fixture('15 minutes sometime today',history);mixed.a.duration=choice(mixed.c.durations.find(x=>x.kind==='request')!.id);mixed.a.date=choice(mixed.c.dates.find(x=>x.kind==='request')!.id);mixed.a.window=choice(mixed.c.windows.find(x=>x.kind==='request')!.id);assert.equal(mixed.resolve().confirmation,false);
});
test('next weekday is computed in code and its ambiguity requires confirmation',()=>{
 const f=fixture('15 minutes anytime next Tuesday');assert.equal(f.resolve().draft?.startDate,'2026-11-03');assert.equal(f.resolve().confirmation,true);assert.match(f.resolve().reason!,/2026-10-27/);
 const g=fixture('15 minutes anytime on Thursday');assert.equal(g.resolve().draft?.startDate,'2026-10-29');assert.equal(g.resolve().confirmation,false);
});
test('expired, invalid and too-short windows produce questions, not meetings',()=>{
 for(const text of ['15 minutes before 1 pm','15 minutes before 2:05 pm','600 minutes anytime tomorrow'])assert.equal(fixture(text).resolve().draft,undefined);
});
test('range candidates handle 24h presets and abbreviated clock ranges',()=>{
 for(const text of ['15 minutes tomorrow between 09:00 and 17:00','half an hour Friday from 9 to 5pm']){
  const f=fixture(text);const w=f.c.windows.find(x=>x.value.mode==='between');assert.ok(w);assert.equal(w.value.start,'09:00');assert.equal(w.value.end,'17:00');
 }
 const f=fixture('15 minutes tomorrow between 3am and midnight');f.a.window=choice(f.c.windows.find(x=>x.value.mode==='between')!.id);f.a.continuous={type:'noul',noul:1};
 assert.equal(f.resolve().draft?.dailyStart,'00:00');assert.equal(f.resolve().draft?.dailyEnd,'24:00');
});
test('non-scheduling intents cannot emit a draft',()=>{
 const f=fixture('15 minutes anytime tomorrow');for(const intent of ['book','hold','status','other']){f.a.intent=choice(intent);assert.equal(f.resolve().draft,undefined);assert.equal(f.resolve().intent,intent)}
 f.a.intent=choice('book',.6);assert.equal(f.resolve().intent,'other');
});
test('one bounded Jev call, validated answers, and no calendar data or action tools',async t=>{
 const old=process.env.TYPESAFE_API_KEY;process.env.TYPESAFE_API_KEY='synthetic-key';t.after(()=>{if(old===undefined)delete process.env.TYPESAFE_API_KEY;else process.env.TYPESAFE_API_KEY=old});
 const f=fixture('15 minutes sometime today');let calls=0;
 t.mock.method(globalThis,'fetch',async(url:Parameters<typeof fetch>[0],options?:RequestInit)=>{calls++;assert.equal(String(url),'https://api.typesafe.ai/v1/systemone');const body=JSON.parse(options!.body as string);assert.equal(body.tools,undefined);assert.equal(body.state.calendar,undefined);assert.ok(options!.signal);return Response.json({answers:f.a,model:'test',usage:{input_tokens:1}})});
 assert.ok((await interpretJev('15 minutes sometime today',zone,now)).draft);assert.equal(calls,1);
});
test('provider errors and malformed or invented choices fail closed',async t=>{
 const old=process.env.TYPESAFE_API_KEY;process.env.TYPESAFE_API_KEY='test';t.after(()=>{if(old===undefined)delete process.env.TYPESAFE_API_KEY;else process.env.TYPESAFE_API_KEY=old});
 const questions=jevQuestions(fixture('15 minutes today').c);
 const responses=[new Response('',{status:429}),Response.json({answers:{}}),Response.json({answers:{intent:choice('invented')}})];
 t.mock.method(globalThis,'fetch',async()=>responses.shift()!);
 for(let i=0;i<3;i++)await assert.rejects(()=>askJev({},questions));
});
test('Haiku fallback has no tools and falls back on long, truncated or failed replies',async t=>{
 const fallback='What day should I use?';
 t.mock.method(globalThis,'fetch',async(_url:Parameters<typeof fetch>[0],options?:RequestInit)=>{const body=JSON.parse(options!.body as string);assert.equal(body.tools,undefined);assert.equal(body.max_tokens,100);return Response.json({stop_reason:'max_tokens',content:[{type:'text',text:'incomplete'}]})});
 assert.equal(await shortSlackReply('hi','reply',fallback),fallback);
});

test('uncertain scheduling can only propose details for confirmation, never book',()=>{
 const f=fixture('15 minutes anytime tomorrow');f.a.intent=choice('schedule',.65);assert.equal(f.resolve().confirmation,true);
 f.a.intent=choice('book',.65);assert.equal(f.resolve().draft,undefined);assert.equal(f.resolve().intent,'other');
 f.a.intent=choice('book');f.a.bookAuthorization={type:'noul',noul:.4};assert.equal(f.resolve().intent,'other');
});
test('relative dates in saved requests keep their original timestamp across midnight',()=>{
 const text=encodeSlackRequest('15 minutes sometime tomorrow',Date.parse('2026-10-25T18:00Z'));
 const c=schedulingCandidates(requestSources(text,'',now),zone);assert.equal(c.dates[0].value.start,'2026-10-26');
});

test('an explicit timezone is preserved and dates are recalculated in that zone',()=>{
 const f=fixture('15 minutes sometime tomorrow in America/New_York');
 f.a.timezone=choice(f.c.zones[0].id);assert.equal(f.resolve().draft?.timezone,'America/New_York');
 f.a.timezone=choice('none');assert.equal(f.resolve().draft,undefined);assert.match(f.resolve().question!,/timezone/);
});

test('leading duration/deadline shorthand is normalized without changing other statements',()=>{
 assert.equal(normalizeSchedulingShorthand('15 minutes after 8 pm'),'a 15 minutes meeting after 8 pm');
 assert.equal(normalizeSchedulingShorthand('<@U123> 30 minutes before tomorrow at 6 pm'),'<@U123> a 30 minutes meeting before tomorrow at 6 pm');
 assert.equal(normalizeSchedulingShorthand('Do not meet 15 minutes after 8 pm'),'Do not meet 15 minutes after 8 pm');
});
