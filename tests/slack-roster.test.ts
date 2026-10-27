import {test} from 'node:test';
import assert from 'node:assert/strict';
import {channelRoster,enrollRoster} from '../lib/slack-roster.ts';
test('channel roster includes every paginated human once and excludes apps and deactivated users',async()=>{
 const pages:any[]=[];
 const roster=await channelRoster('channel',async(method,body)=>{
  if(method==='conversations.members'){pages.push(body);return body.cursor?{members:['U2','U3'],response_metadata:{}}:{members:['U1','U2','BOT','APP','OLD','USLACKBOT'],response_metadata:{next_cursor:'next'}}}
  const id=body.user;return {user:{id,real_name:'Name '+id,is_bot:id==='BOT',is_app_user:id==='APP',deleted:id==='OLD'}};
 });
 assert.deepEqual(roster.map(p=>p.id),['U1','U2','U3']);assert.equal(pages[1].cursor,'next');assert.ok(pages.every(p=>p.channel==='channel'));
});
test('member lookup failure never silently creates a partial roster',async()=>{
 await assert.rejects(channelRoster('channel',async(method)=>{if(method==='conversations.members')return {members:['U1']};throw Error('Slack unavailable')}),/Slack unavailable/);
});
test('enrollment is sequential and one failed calendar does not skip later members',async()=>{
 const visited:string[]=[],failed:string[]=[];let active=0;
 await enrollRoster([{id:'U1'},{id:'U2'},{id:'U3'}],async id=>{assert.equal(active++,0);visited.push(id);await Promise.resolve();active--;if(id==='U2')throw Error('needs calendar')},async id=>{failed.push(id)});
 assert.deepEqual(visited,['U1','U2','U3']);assert.deepEqual(failed,['U2']);
});
