import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {PGlite} from '@electric-sql/pglite';
import {verifyAppleNotification,applyAppleNotification,appleRelayEmailEnabled} from '../lib/apple-notifications.ts';
import {calendarIntentSchema} from '../db/calendar-intent-schema.mjs';
import {appleSigninSchema} from '../db/apple-signin-schema.mjs';
import {appleNotificationSchema} from '../db/apple-notification-schema.mjs';
import {beginCalendarIntent,bindCalendarAccount,runCalendarIntent} from '../lib/calendar-intent.ts';
import {loadWithMocks} from './module-fixture.ts';

test('Apple revocations require a signed token for the configured audience and valid bounded claims',async()=>{
 const pair=await generateKeyPair('RS256'),wrong=await generateKeyPair('RS256');
 const keys=createLocalJWKSet({keys:[{...await exportJWK(pair.publicKey),kid:'apple-test'}]});
 const now=Math.floor(Date.now()/1000),events={type:'consent-revoked',sub:'person',event_time:now};
 const base={iss:'https://appleid.apple.com',aud:'com.wharf.app',iat:now,jti:'event-id',events};
 const sign=(claims:any,key=pair.privateKey)=>new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'apple-test'}).sign(key);
 const result=await verifyAppleNotification(await sign(base),'com.wharf.app',keys);
 assert.equal(result.account,'apple:person');assert.match(result.id,/^[a-f0-9]{64}$/);
 assert.equal((await verifyAppleNotification(await sign({...base,events:JSON.stringify(events)}),'com.wharf.app',keys)).type,'consent-revoked');
 for(const patch of [{iss:'https://evil.example'},{aud:'another-app'},{iat:now+600},{iat:now-8*86400},{jti:''},{events:{...events,sub:''}},{events:{...events,event_time:now+600}},{events:{...events,type:'other'}},{events:'not json'}])await assert.rejects(verifyAppleNotification(await sign({...base,...patch}),'com.wharf.app',keys));
 const relay={...events,type:'email-disabled',email:'private@privaterelay.appleid.com'};
 assert.equal((await verifyAppleNotification(await sign({...base,events:relay}),'com.wharf.app',keys)).email,relay.email);
 await assert.rejects(verifyAppleNotification(await sign({...base,events:{...relay,email:'victim@example.com'}}),'com.wharf.app',keys));
 await assert.rejects(verifyAppleNotification(await sign(base,wrong.privateKey),'com.wharf.app',keys));
});
async function fixture(){
 const database=new PGlite();
 await database.exec(`CREATE TABLE sessions(id text PRIMARY KEY,google_sub text,name text,email text,picture text,expires_at timestamptz);CREATE TABLE oauth_states(id text);CREATE TABLE calendar_provider_states(id text);INSERT INTO sessions VALUES('one','apple:person','Ben','test@example.com',NULL,now()+interval '1 day'),('two','apple:person','Ben','test@example.com',NULL,now()+interval '1 day'),('other','google-person','Other',NULL,NULL,now()+interval '1 day'),('pending',NULL,NULL,NULL,NULL,now()+interval '1 day');`);
 for(const statement of [...calendarIntentSchema,...appleSigninSchema,...appleNotificationSchema])await database.exec(statement);
 await database.exec("INSERT INTO apple_accounts(account_id,name,email,authenticated_at) VALUES('apple:person','Ben','test@example.com',now()-interval '1 hour')");
 const db:any=(parts:TemplateStringsArray,...values:unknown[])=>database.query(parts.reduce((out,part,index)=>out+(index?'$'+index:'')+part,''),values).then(r=>r.rows);
 return {database,db};
}
test('Apple revocation signs out all affected sessions, preserves other identities, and blocks in-flight login',async()=>{
 const {database,db}=await fixture();try{
  const intent=await beginCalendarIntent(db,'pending',null);
  const event={id:'a'.repeat(64),account:'apple:person',type:'consent-revoked' as const,eventTime:Math.floor(Date.now()/1000)};
  assert.equal(await applyAppleNotification(db,event),true);
  assert.deepEqual((await database.query<{google_sub:string|null}>("SELECT google_sub FROM sessions WHERE id IN ('one','two')")).rows,[{google_sub:null},{google_sub:null}]);
  assert.equal((await database.query<{google_sub:string|null}>("SELECT google_sub FROM sessions WHERE id='other'")).rows[0].google_sub,'google-person');
  await assert.rejects(runCalendarIntent(intent,()=>bindCalendarAccount(db,'apple:person')),/superseded/);
  // Simulate a fresh authorization, then replay the old delivery. It must not log out again.
  await database.exec("UPDATE sessions SET google_sub='apple:person' WHERE id='one'");
  assert.equal(await applyAppleNotification(db,event),false);
  assert.equal((await database.query<{google_sub:string|null}>("SELECT google_sub FROM sessions WHERE id='one'")).rows[0].google_sub,'apple:person');
 }finally{await database.close()}
});
test('delayed Apple revocation preserves a newer login while clearing older sessions and deleted profiles',async()=>{
 const {database,db}=await fixture();try{
  const now=Math.floor(Date.now()/1000);
  await database.exec("UPDATE apple_accounts SET authenticated_at=now(); UPDATE sessions SET apple_authenticated_at=now() WHERE id='one'");
  await applyAppleNotification(db,{id:'b'.repeat(64),account:'apple:person',type:'account-deleted',eventTime:now-600});
  assert.equal((await database.query<{google_sub:string|null}>("SELECT google_sub FROM sessions WHERE id='one'")).rows[0].google_sub,'apple:person');
  assert.equal((await database.query<{google_sub:string|null}>("SELECT google_sub FROM sessions WHERE id='two'")).rows[0].google_sub,null);
  assert.equal((await database.query('SELECT * FROM apple_accounts')).rows.length,1);
  await applyAppleNotification(db,{id:'c'.repeat(64),account:'apple:person',type:'account-deleted',eventTime:now+1});
  assert.equal((await database.query('SELECT * FROM apple_accounts')).rows.length,0);
 }finally{await database.close()}
});
test('notification endpoint does no database work before verification and returns retriable errors on storage failure',async t=>{
 const old=process.env.APPLE_NOTIFICATION_AUDIENCE;process.env.APPLE_NOTIFICATION_AUDIENCE='com.wharf.app';t.after(()=>{if(old===undefined)delete process.env.APPLE_NOTIFICATION_AUDIENCE;else process.env.APPLE_NOTIFICATION_AUDIENCE=old});
 let verified=false,writes=0,fail=false;
 const {POST}=loadWithMocks<{POST:(req:Request)=>Promise<Response>}>(new URL('../app/api/auth/apple/notifications/route.ts',import.meta.url),{
  '@/lib/auth':{json:(data:unknown,status=200)=>Response.json(data,{status}),sql:()=>{assert.ok(verified);return {}}},
  '@/lib/apple-notifications':{verifyAppleNotification:async(token:string,audience:string)=>{assert.equal(audience,'com.wharf.app');if(token!=='signed')throw Error('invalid');verified=true;return {}},applyAppleNotification:async()=>{writes++;if(fail)throw Error('outage')}},
 });
 const request=(payload:string)=>new Request('https://wharf.example/api/auth/apple/notifications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({payload})});
 assert.equal((await POST(request('invalid'))).status,400);assert.equal(writes,0);
 assert.equal((await POST(request('x'.repeat(21000)))).status,413);assert.equal(writes,0);
 assert.equal((await POST(request('signed'))).status,200);assert.equal(writes,1);
 fail=true;assert.equal((await POST(request('signed'))).status,503);
 delete process.env.APPLE_NOTIFICATION_AUDIENCE;assert.equal((await POST(request('signed'))).status,503);
});
test('relay forwarding preferences resist reordered events and are checked without retaining email addresses',async()=>{
 const {database,db}=await fixture();try{
  const now=Math.floor(Date.now()/1000),email='private@privaterelay.appleid.com';
  const event={id:'d'.repeat(64),account:'apple:person',type:'email-disabled' as const,eventTime:now,email};
  await applyAppleNotification(db,event);assert.equal(await appleRelayEmailEnabled(db,email),false);
  assert.equal(await appleRelayEmailEnabled(db,'person@example.com'),true);
  await applyAppleNotification(db,{...event,id:'e'.repeat(64),type:'email-enabled',eventTime:now-1});
  assert.equal(await appleRelayEmailEnabled(db,email),false);
  await applyAppleNotification(db,{...event,id:'f'.repeat(64),type:'email-enabled',eventTime:now+1});
  assert.equal(await appleRelayEmailEnabled(db,email),true);
  assert.doesNotMatch(JSON.stringify((await database.query('SELECT * FROM apple_email_preferences')).rows),/private@/);
  assert.equal((await database.query<{google_sub:string}>("SELECT google_sub FROM sessions WHERE id='one'")).rows[0].google_sub,'apple:person');
 }finally{await database.close()}
});
test('invitation delivery checks relay forwarding before invoking SMTP',async()=>{
 const sent:string[]=[];
 const {deliverInvitations}=loadWithMocks<{deliverInvitations:()=>Promise<unknown>}>(new URL('../lib/invitations.ts',import.meta.url),{
  'node:crypto':{},'./auth':{sql:()=>({})},'./calendar-invitation':{},
  './apple-notifications':{appleRelayEmailEnabled:async(_db:unknown,email:string)=>!email.startsWith('disabled')},
  './invitation-delivery':{InvitationNotSentError:Error,deliverInvitationJobs:async(_db:unknown,send:Function)=>{
   await assert.rejects(send({to:['disabled@privaterelay.appleid.com']},'blocked'),/not sent/);
   await send({to:['enabled@privaterelay.appleid.com']},'allowed');
  }},
  './gmail-delivery':{gmailConfigured:()=>true,sendGmailInvitation:async(_payload:unknown,id:string)=>{sent.push(id);return id}},
 });
 await deliverInvitations();assert.deepEqual(sent,['allowed']);
});
