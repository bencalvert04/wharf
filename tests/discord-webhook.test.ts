import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {loadWithMocks} from './module-fixture.ts';
import * as security from '../lib/discord-security.ts';
import {sealToken,openToken} from '../lib/token-vault.ts';
const app='12345678901234567',guild='12345678901234568',channel='12345678901234569',user='12345678901234570',guest='12345678901234571';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const key=(publicKey.export({format:'der',type:'spki'}) as Buffer).subarray(-32).toString('hex');
function fixture(t:any,component?:any,usage=0){
 const values={DISCORD_PUBLIC_KEY:key,DISCORD_APPLICATION_ID:app,DISCORD_BOT_TOKEN:'test-bot',GOOGLE_TOKEN_ENCRYPTION_KEY:'a'.repeat(64)};
 for(const [name,value] of Object.entries(values)){const old=process.env[name];process.env[name]=value;t.after(()=>{if(old===undefined)delete process.env[name];else process.env[name]=old})}
 const writes:any[][]=[],scheduled:Function[]=[];
 const db=async(strings:TemplateStringsArray,...values:any[])=>{const q=strings.join('');if(q.includes('count(*)'))return [{n:usage}];if(q.includes('SELECT * FROM discord_components'))return component?[component]:[];writes.push(values);return []};
 const {discordWebhook}=loadWithMocks<{discordWebhook:(r:Request)=>Promise<Response>}>(new URL('../lib/discord-webhook.ts',import.meta.url),{
  'next/server':{after:(fn:Function)=>scheduled.push(fn)},'./auth':{sql:()=>db},'./token-vault':{sealToken},'./discord-security':security,'./discord-workflow':{runDiscordJob:async()=>{}},
 });
 const send=(patch:any,invalid=false)=>{const raw=JSON.stringify({id:'12345678901234572',application_id:app,token:'private-interaction-token',guild_id:guild,channel_id:channel,member:{user:{id:user}},type:2,data:{name:'wharf',options:[{name:'request',value:'30 minutes tomorrow'}]},...patch});const timestamp=String(Math.floor(Date.now()/1000));return discordWebhook(new Request('https://example.test/api/discord/interactions',{method:'POST',headers:{'x-signature-timestamp':timestamp,'x-signature-ed25519':invalid?'f'.repeat(128):sign(null,Buffer.from(timestamp+raw),privateKey).toString('hex')},body:raw}))};
 return {send,writes,scheduled};
}
test('Discord ping is verified without creating work and bad signatures are rejected',async t=>{
 const f=fixture(t);assert.deepEqual(await (await f.send({type:1})).json(),{type:1});assert.equal((await f.send({},true)).status,401);assert.equal(f.writes.length,0);assert.equal(f.scheduled.length,0);
});
test('commands persist a private deferred job with explicit human roster and encrypted credentials',async t=>{
 const f=fixture(t);const response=await f.send({data:{name:'wharf',options:[{name:'request',value:'30 minutes tomorrow'},{name:'attendee_1',value:guest},{name:'timezone',value:'Europe/London'}],resolved:{members:{[guest]:{}},users:{[guest]:{bot:false}}}}});
 assert.deepEqual(await response.json(),{type:5,data:{flags:64}});assert.equal(f.scheduled.length,1);
 const [id,raw]=f.writes[0],stored=JSON.parse(raw);assert.equal(stored.team_id,`discord:${guild}`);assert.ok(!raw.includes('private-interaction-token'));
 const context=JSON.parse(openToken(stored.interaction,`discord-job:${id}`));assert.deepEqual(context.participants,[user,guest]);assert.equal(context.timezone,'Europe/London');assert.equal(stored.event.thread_ts,undefined);
});
test('commands reject bots, nonmembers, missing guilds and invalid timezones before queueing',async t=>{
 const f=fixture(t);
 for(const patch of [{guild_id:undefined},{data:{name:'wharf',options:[{name:'request',value:'30 minutes tomorrow'},{name:'attendee_1',value:guest}],resolved:{members:{[guest]:{}},users:{[guest]:{bot:true}}}}},{data:{name:'wharf',options:[{name:'request',value:'30 minutes tomorrow'},{name:'attendee_1',value:guest}]}},{data:{name:'wharf',options:[{name:'request',value:'30 minutes tomorrow'},{name:'timezone',value:'Not/AZone'}]}}])assert.equal((await (await f.send(patch)).json()).type,4);
 assert.equal(f.writes.length,0);
});
test('a private clarification opens a modal only for its owner and preserves its saved conversation',async t=>{
 const custom='wharf:12345678-1234-1234-1234-123456789012';
 const f=fixture(t,{team_id:`discord:${guild}`,channel_id:channel,user_id:user,action:'wharf_answer',value:'original-thread',participants:[user,guest],timezone:'UTC'});
 assert.equal((await (await f.send({type:3,data:{custom_id:custom},member:{user:{id:guest}}})).json()).type,4);
 assert.equal((await (await f.send({type:3,data:{custom_id:custom}})).json()).type,9);
 const submitted=await f.send({type:5,data:{custom_id:custom,components:[{components:[{custom_id:'answer',value:'45 minutes'}]}]}});
 assert.equal((await submitted.json()).type,5);
 const stored=JSON.parse(f.writes[0][1]);assert.equal(JSON.parse(stored.view.private_metadata).thread,'original-thread');assert.equal(stored.view.state.values.details.answer.value,'45 minutes');
});
test('daily request cap blocks new commands but permits existing calendar actions',async t=>{
 const f=fixture(t,{team_id:`discord:${guild}`,channel_id:channel,user_id:user,action:'wharf_attend',value:'meeting',participants:[user],timezone:'UTC'},100);
 assert.equal((await (await f.send({})).json()).type,4);
 assert.equal((await (await f.send({type:3,data:{custom_id:'wharf:12345678-1234-1234-1234-123456789012'}})).json()).type,5);
});
