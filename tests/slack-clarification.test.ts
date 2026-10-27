import {slackIntent} from '../lib/slack-security.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {missingMeetingDetail,askPrivately,openPrivateAnswer} from '../lib/slack-clarification.ts';
import {slackBlocks} from '../lib/slack-client.ts';
test('missing details are detected locally without a model or invented defaults',()=>{
 assert.equal(missingMeetingDetail('make us a meeting tomorrow between 9 and 5')?.duration,true);
 assert.equal(slackIntent('schedule a meeting'),'schedule');
 assert.equal(slackIntent('book a meeting'),'schedule');
 assert.equal(missingMeetingDetail('30 minutes')?.question,'What day and time range should I use?');
 assert.equal(missingMeetingDetail('30 minutes on Thursday')?.question,'Between what start and end times should I look?');
 for(const text of ['30 minutes tomorrow between 10 am and 8 pm','half an hour tomorrow afternoon','an hour before 6 pm today','45-minute meeting tomorrow from 9 to 5','30 minutes Thursday 10 am to 8 pm'])assert.equal(missingMeetingDetail(text),null);
});
test('clarifications target only the requester in the original channel and offer private answers',async t=>{
 const calls:any[]=[];
 t.mock.method(globalThis,'fetch',async(url:any,init:any)=>{calls.push({url,body:JSON.parse(init.body)});return Response.json({ok:true})});
 await askPrivately('C123','U123','123.456','How long should the meeting be?',true);
 assert.match(calls[0].url,/chat.postEphemeral$/);assert.equal(calls[0].body.channel,'C123');assert.equal(calls[0].body.user,'U123');
 const buttons=calls[0].body.blocks[1].elements;assert.equal(new Set(buttons.map((b:any)=>b.action_id)).size,buttons.length,'Slack requires unique action IDs within a block');assert.equal(buttons[0].action_id,'wharf_duration_15');assert.equal(JSON.parse(buttons[0].value).thread,'123.456');assert.equal(buttons.at(-1).action_id,'wharf_answer');
 await openPrivateAnswer({team:{id:'T'},channel:{id:'C'},user:{id:'U'},trigger_id:'trigger',actions:[{value:'thread'}]});
 assert.match(calls[1].url,/views.open$/);assert.deepEqual(JSON.parse(calls[1].body.view.private_metadata),{team:'T',channel:'C',user:'U',thread:'thread'});
});
test('a meeting announcement without opt-in buttons has no invalid empty actions block',()=>{
 assert.equal(slackBlocks('Meeting details',[]).length,1);
});
test('time clarification uses inline controls and midnight end without a private-answer button',async t=>{
 const {timeRangeBlocks,timeRangeAnswer}=await import('../lib/slack-clarification.ts');
 const blocks=timeRangeBlocks('123.456','Between what start and end times should I look?') as any[];
 const controls=blocks.at(-1).elements;
 assert.equal(controls[0].options[0].value,'00:00');
 assert.equal(controls[1].options.at(-1).value,'24:00');
 assert.equal(controls[0].options.length,96);
 assert.equal(controls.some((v:any)=>v.action_id==='wharf_answer'),false);
 const payload=(start:string,end:string)=>({actions:[controls.at(-1)],state:{values:{wharf_time_range:{wharf_range_start:{selected_option:{value:start}},wharf_range_end:{selected_option:{value:end}}}}}});
 assert.match(timeRangeAnswer(payload('00:00','24:00')).answer,/between 00:00 and 24:00/);
 assert.equal(timeRangeAnswer(payload('09:00','17:00')).thread,'123.456');
 assert.throws(()=>timeRangeAnswer(payload('17:00','09:00')),/later/);
 assert.throws(()=>timeRangeAnswer(payload('','17:00')),/Choose both/);
 const dated=payload('09:00','17:00');dated.actions=[{value:JSON.stringify({thread:'123',needsDay:true})}];
 assert.throws(()=>timeRangeAnswer(dated),/Choose a day/);
 const calls:any[]=[];t.mock.method(globalThis,'fetch',async(url:any,init:any)=>{calls.push(JSON.parse(init.body));return Response.json({ok:true})});
 await askPrivately('C123','U123','123.456','Between what start and end times should I look?');
 assert.equal(calls[0].blocks.at(-1).elements.at(-1).action_id,'wharf_time_range');
});
