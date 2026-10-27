import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interpretSlackRequest,interpretOpenSlackRequest} from '../lib/slack-agent.ts';
const draft={title:'Sync',startDate:'2030-01-07',timezone:'UTC'};
test('Haiku proposes a validated draft without receiving calendar data or booking authority',async()=>{
 const original=globalThis.fetch;let sent:any;
 globalThis.fetch=async(_url,options)=>{sent=JSON.parse(options?.body as string);return Response.json({content:[{type:'tool_use',name:'propose_meeting',input:draft}]})};
 try{const result=await interpretSlackRequest('30 minutes with <@U2> next Monday','U1',['U1','U2'],'UTC');assert.equal(result.draft?.durationMinutes,30);assert.equal(sent.max_tokens,700);assert.deepEqual(sent.thinking,{type:'disabled'});assert.deepEqual(result.draft?.participants,[{id:'U1',name:'U1'},{id:'U2',name:'U2'}]);assert.equal(sent.tools[0].input_schema.properties.participants,undefined);assert.equal(sent.tools.length,1);assert.equal(sent.tools[0].name,'propose_meeting');assert.match(sent.model,/haiku/);assert.equal(sent.messages.length,1)}finally{globalThis.fetch=original}
});
test('Model cannot add a recipient, omit the requester, or return invalid scheduling constraints',async()=>{
 const original=globalThis.fetch;
 try{for(const input of [{...draft,participants:[{id:'U2',name:'U2'}]},{...draft,participants:[{id:'U1',name:'U1'},{id:'U2',name:'U2'},{id:'U3',name:'U3'}]},{...draft,timezone:'not/a-zone'}]){globalThis.fetch=async()=>Response.json({content:[{type:'tool_use',name:'propose_meeting',input}]});await assert.rejects(()=>interpretSlackRequest('schedule','U1',['U1','U2'],'UTC'))}}finally{globalThis.fetch=original}
});
test('Missing details produce a question and provider failures do not produce fabricated success',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>Response.json({content:[{type:'text',text:'Which day?'}]});assert.deepEqual(await interpretSlackRequest('schedule','U1',['U1','U2'],'UTC'),{question:'Which day?'});globalThis.fetch=async()=>new Response('',{status:429});await assert.rejects(()=>interpretSlackRequest('schedule','U1',['U1','U2'],'UTC'),/unavailable/)}finally{globalThis.fetch=original}
});

test('truncated provider output never creates a meeting',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>Response.json({stop_reason:'max_tokens',content:[{type:'tool_use',name:'propose_meeting',input:draft}]});await assert.rejects(()=>interpretSlackRequest('tomorrow','U1',['U1','U2'],'UTC'),/incomplete/)}finally{globalThis.fetch=original}
});
test('continuous requests clamp elapsed start times and reject expired deadlines',async()=>{
 const original=globalThis.fetch;
 const now=Date.parse('2026-10-26T21:30Z');
 try{
  globalThis.fetch=async()=>Response.json({content:[{type:'tool_use',name:'propose_meeting',input:{startDate:'2026-10-26',dayStart:'20:00',dayEnd:'24:00',windowMode:'continuous',timezone:'UTC'}}]});
  const result=await interpretSlackRequest('after 8 pm','U1',['U1','U2'],'UTC',now);assert.equal(result.draft?.dayStart,'21:30');assert.equal(result.draft?.dayEnd,'23:00');
  globalThis.fetch=async()=>Response.json({content:[{type:'tool_use',name:'propose_meeting',input:{startDate:'2026-10-26',dayStart:'09:00',dayEnd:'18:00',windowMode:'continuous',timezone:'UTC'}}]});
  assert.deepEqual(await interpretSlackRequest('before 6 pm','U1',['U1','U2'],'UTC',now),{question:'That deadline has passed. What later time should I use?'});
 }finally{globalThis.fetch=original}
});

test('open Slack meetings contain no reserved people or Slack identities',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>Response.json({content:[{type:'tool_use',name:'propose_meeting',input:{...draft,durationMinutes:15}}]});const result=await interpretOpenSlackRequest('Fine, 15 minutes. We can meet sometime today.','UTC');assert.equal(result.draft?.durationMinutes,15);assert.equal(result.draft?.openJoin,true);assert.equal('participants' in result.draft!,false)}finally{globalThis.fetch=original}
});

test('background is separate from current instructions and explicit titles survive validation',async()=>{
 const original=globalThis.fetch;let sent:any;
 try{globalThis.fetch=async(_url,options)=>{sent=JSON.parse(options!.body as string);return Response.json({content:[{type:'tool_use',name:'propose_meeting',input:{...draft,title:'Design review',requestedTitle:true}}]})};
 const result=await interpretOpenSlackRequest('Make it 15 minutes','UTC',Date.now(),'Call it Design review, tomorrow at 6 pm');
 assert.equal(result.requestedTitle,true);assert.equal(result.draft?.title,'Design review');assert.equal('requestedTitle' in result.draft!,false);
 assert.deepEqual(JSON.parse(sent.messages[0].content),{olderMessages:'Call it Design review, tomorrow at 6 pm',currentRequestAndFollowups:'Make it 15 minutes'});
 }finally{globalThis.fetch=original}
});

test('default daily limits exclude nights across deadlines and explicit hours can override them',async t=>{
 const {toConstraints}=await import('../lib/agent-contract.ts');
 const {allowed}=await import('../lib/availability.ts');
 let input:any={startDate:'2026-10-27',endDate:'2026-10-28',dayStart:'02:00',dayEnd:'17:00',windowMode:'continuous',timezone:'UTC',durationMinutes:15};
 t.mock.method(globalThis,'fetch',async()=>Response.json({content:[{type:'tool_use',name:'propose_meeting',input}]}));
 const now=Date.parse('2026-10-27T02:00Z');
 const result=await interpretSlackRequest('15 minutes before tomorrow at 5 pm','U1',['U1'],'UTC',now);
 const windows=allowed(toConstraints(result.draft!));
 assert.deepEqual(windows.map(w=>[new Date(w.start).toISOString(),new Date(w.end).toISOString()]),[
 ['2026-10-27T05:00:00.000Z','2026-10-27T23:00:00.000Z'],['2026-10-28T05:00:00.000Z','2026-10-28T17:00:00.000Z']]);
 input={...input,endDate:'2026-10-27',dayStart:'03:00',dayEnd:'24:00',allowEarlyHours:true,allowLateHours:true};
 const explicit=await interpretSlackRequest('15 minutes between 3 am and midnight today','U1',['U1'],'UTC',now);
 assert.equal(explicit.draft?.dayStart,'03:00');assert.equal(explicit.draft?.dayEnd,'24:00');
 assert.equal(toConstraints(explicit.draft!).from,'00:00');assert.equal(toConstraints(explicit.draft!).to,'24:00');
 input={...input,dayStart:'02:00',dayEnd:'04:00',allowEarlyHours:false,allowLateHours:false};
 const empty=await interpretSlackRequest('15 minutes before 4 am','U1',['U1'],'UTC',now);
 assert.match(empty.question!,/No time fits/);
 input={startDate:'2026-10-28',timezone:'UTC',durationMinutes:15};
 const dayOnly=await interpretSlackRequest('15 minutes tomorrow','U1',['U1'],'UTC',now);
 assert.equal(dayOnly.draft?.dayStart,'05:00');assert.equal(dayOnly.draft?.dayEnd,'23:00');
});
