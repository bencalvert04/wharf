import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {withSlackWorkspace,slackBotToken,slackBotUserId} from '../lib/slack-context.ts';
import {slack} from '../lib/slack-client.ts';
import {allowedSlackChannel} from '../lib/slack-security.ts';
import {slackScopes,validSlackState,parseSlackInstallation} from '../lib/slack-oauth.ts';
import {slackInstallationsSchema} from '../db/slack-installations-schema.mjs';
import {sealToken,openToken} from '../lib/token-vault.ts';

test('concurrent workspace API requests retain their own credentials and fail closed without a context',async(t)=>{
 const seen:string[]=[];
 t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{seen.push(new Headers(init.headers).get('authorization')!);await new Promise(resolve=>setTimeout(resolve,1));return Response.json({ok:true})});
 await Promise.all(['A','B'].map((id,index)=>withSlackWorkspace({teamId:'T'+id,botToken:'token-'+id,botUserId:'U'+id},async()=>{
  await new Promise(resolve=>setTimeout(resolve,index?1:5));
  assert.equal(slackBotUserId(),'U'+id);
  await slack('chat.postMessage',{channel:'C'+id,text:'hello'});
  assert.equal(slackBotToken(),'token-'+id);
 })));
 assert.deepEqual(seen.sort(),['Bearer token-A','Bearer token-B']);
 await assert.rejects(slack('chat.postMessage',{channel:'C1',text:'wrong workspace'}),/context is required/);
 assert.equal(seen.length,2);
});

test('OAuth state rejects absent, malformed and mismatched browser state',()=>{
 const state=randomBytes(32).toString('base64url');
 assert.equal(validSlackState(state,state),true);
 for(const value of [null,'',state+'a',randomBytes(32).toString('base64url')])assert.equal(validSlackState(value,state),false);
 assert.equal(validSlackState(state,undefined),false);
});

test('OAuth validates app identity, workspace, bot token and required permissions',()=>{
 const valid={ok:true,app_id:'A1',team:{id:'T1',name:'Team'},bot_user_id:'U1',access_token:'xoxb-example',token_type:'bot',authed_user:{id:'U2'},scope:slackScopes.join(',')};
 assert.equal(parseSlackInstallation(valid,'A1').teamId,'T1');
 for(const patch of [{app_id:'other'},{is_enterprise_install:true},{team:{id:'E1'}},{scope:'chat:write'},{access_token:'xoxp-user'},{refresh_token:'unsupported'},{ok:false}])assert.throws(()=>parseSlackInstallation({...valid,...patch},'A1'));
});

test('distributed conversations are enabled only inside an installed workspace context',()=>{
 withSlackWorkspace({teamId:'T1',botToken:'x',botUserId:'U1'},()=>{
  assert.equal(allowedSlackChannel('C123'),true);assert.equal(allowedSlackChannel('G123'),true);
  assert.equal(allowedSlackChannel('D123'),false);assert.equal(allowedSlackChannel(''),false);
 });
});

test('installation schema is repeatable and OAuth state can only be claimed once',async()=>{
 const db=new PGlite();
 try{
  for(let i=0;i<2;i++)for(const statement of slackInstallationsSchema)await db.exec(statement);
  await db.exec("INSERT INTO slack_install_states(id,browser_hash) VALUES('state','browser');");
  const claim=()=>db.query("DELETE FROM slack_install_states WHERE id='state' AND browser_hash='browser' AND expires_at>now() RETURNING id");
  const claims=await Promise.all([claim(),claim()]);assert.equal(claims.reduce((n,r)=>n+r.rows.length,0),1);
  await db.exec("INSERT INTO slack_install_states(id,browser_hash,expires_at) VALUES('old','browser',now()-interval '1 second')");
  assert.equal((await db.query("DELETE FROM slack_install_states WHERE id='old' AND expires_at>now() RETURNING id")).rows.length,0);
 }finally{await db.close()}
});

test('encrypted workspace tokens cannot be decrypted as a different workspace',()=>{
 const previous=process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;process.env.GOOGLE_TOKEN_ENCRYPTION_KEY='ab'.repeat(32);
 try{const cipher=sealToken('xoxb-secret','slack-installation:T1');assert.equal(openToken(cipher,'slack-installation:T1'),'xoxb-secret');assert.throws(()=>openToken(cipher,'slack-installation:T2'));assert.ok(!cipher.includes('xoxb-secret'))}finally{if(previous===undefined)delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;else process.env.GOOGLE_TOKEN_ENCRYPTION_KEY=previous}
});
