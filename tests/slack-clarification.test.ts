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
 const buttons=calls[0].body.blocks[1].elements;assert.equal(buttons[0].action_id,'wharf_duration');assert.equal(JSON.parse(buttons[0].value).thread,'123.456');assert.equal(buttons.at(-1).action_id,'wharf_answer');
 await openPrivateAnswer({team:{id:'T'},channel:{id:'C'},user:{id:'U'},trigger_id:'trigger',actions:[{value:'thread'}]});
 assert.match(calls[1].url,/views.open$/);assert.deepEqual(JSON.parse(calls[1].body.view.private_metadata),{team:'T',channel:'C',user:'U',thread:'thread'});
});
test('a meeting announcement without opt-in buttons has no invalid empty actions block',()=>{
 assert.equal(slackBlocks('Meeting details',[]).length,1);
});
