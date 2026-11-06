import {test} from 'node:test';
import assert from 'node:assert/strict';
import {slack} from '../lib/slack-client.ts';
import {withSlackWorkspace} from '../lib/slack-context.ts';
import {withDiscordInteraction} from '../lib/discord-context.ts';
const workspace={teamId:'discord:12345678901234567',botToken:'discord-test',botUserId:'12345678901234568',platform:'discord' as const};
const context={id:'12345678901234569',application_id:workspace.botUserId,token:'test-interaction',guild_id:'12345678901234567',channel_id:'12345678901234570',userId:'12345678901234571',participants:['12345678901234571','12345678901234572'],timezone:'America/Denver'};
test('shared agent transport uses private interaction replies, DM fallback, explicit roster and no Slack network calls',async t=>{
 const calls:{url:string;init:RequestInit;body:any}[]=[];
 t.mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{calls.push({url,init,body:init.body?JSON.parse(String(init.body)):null});return Response.json({id:'12345678901234573',channel_id:context.channel_id})});
 await withSlackWorkspace(workspace,()=>withDiscordInteraction({...context},async()=>{
  assert.deepEqual((await slack('conversations.members',{})).members,context.participants);
  await slack('chat.postEphemeral',{channel:context.channel_id,user:context.userId,text:'Your calendar link'});
  await slack('chat.postEphemeral',{channel:context.channel_id,user:context.userId,text:'Second private reply'});
  await slack('chat.postEphemeral',{channel:context.channel_id,user:context.participants[1],text:'Guest calendar link'});
  await slack('chat.postMessage',{channel:context.channel_id,text:'Meeting booked'});
 }));
 assert.equal(calls[0].init.method,'PATCH');assert.match(calls[0].url,/messages\/@original$/);
 assert.equal(calls[1].body.flags,64);
 assert.equal(calls[2].body.recipient_id,context.participants[1]);
 assert.equal(calls[3].body.content,'Guest calendar link');
 assert.equal(calls[4].body.content,'Meeting booked');
 assert.ok(calls.every(c=>c.url.startsWith('https://discord.com/api/v10/')));
 assert.deepEqual(calls[4].body.allowed_mentions,{parse:[]});
});
