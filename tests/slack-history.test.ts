import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatSlackHistory,slackHistory} from '../lib/slack-history.ts';
test('history excludes bots, future messages, stale messages and limits context',()=>{
 const before='1793059000';
 const messages=[{ts:'1793058990',text:'tomorrow at 6 pm',user:'U1'},{ts:before,text:'current'},{ts:'1793058980',text:'card',bot_id:'B1'},{ts:'1',text:'ancient'}];
 const result=formatSlackHistory(messages,before);
 assert.match(result,/tomorrow at 6 pm/);assert.doesNotMatch(result,/current|card|ancient/);
 assert.ok(formatSlackHistory(Array.from({length:30},(_,i)=>({ts:String(Number(before)-i-1),text:'x'.repeat(2000)})),before).length<=6000);
});
test('history is conversation scoped and falls back on errors without retrying',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async(url,options)=>{calls++;assert.match(String(url),/conversations.history/);const body=options!.body as URLSearchParams;assert.equal(body.get('channel'),'C1');assert.equal(body.get('latest'),'1793059000');assert.equal(body.get('limit'),'15');return new Response('',{status:429})};assert.equal(await slackHistory('C1','1793059000'),'');assert.equal(calls,1)}finally{globalThis.fetch=original}
});
