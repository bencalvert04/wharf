import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatSlackHistory,slackHistory} from '../lib/slack-history.ts';
test('history filters nonhuman and out-of-window messages and bounds context size',()=>{
 const before=1900000000,week=7*86400;
 const messages=Array.from({length:25},(_,i)=>({ts:String(before-i-1),user:'U1',text:`human-${i}`}));
 const records=formatSlackHistory(messages,String(before)).split('\n').map(line=>JSON.parse(line));
 assert.equal(records.length,15);
 assert.deepEqual(records.map(m=>m.text),Array.from({length:15},(_,i)=>`human-${14-i}`));
 const boundary=formatSlackHistory([
  {ts:String(before-week),user:'U1',text:'oldest permitted'},
  {ts:String(before-week-1),user:'U1',text:'too old'},
  {ts:String(before-1),user:'U1',bot_id:'B1',text:'bot'},
  {ts:String(before-2),user:'U1',subtype:'message_changed',text:'system'},
  {ts:String(before),user:'U1',text:'current request'},
  {ts:String(before+1),user:'U1',text:'future message'},
 ],String(before));
 assert.match(boundary,/oldest permitted/);
 assert.doesNotMatch(boundary,/too old|bot|system|current request|future message/);
 assert.equal(formatSlackHistory(messages.map(m=>({...m,text:'x'.repeat(2000)})),String(before)).length,6000);
});

test('history is conversation scoped and falls back on errors without retrying',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async(url,options)=>{calls++;assert.match(String(url),/conversations.history/);const body=options!.body as URLSearchParams;assert.equal(body.get('channel'),'C1');assert.equal(body.get('latest'),'1793059000');assert.equal(body.get('limit'),'15');return new Response('',{status:429})};assert.equal(await slackHistory('C1','1793059000'),'');assert.equal(calls,1)}finally{globalThis.fetch=original}
});
