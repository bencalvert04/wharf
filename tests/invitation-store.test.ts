import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {claimInvitations,recoverInterruptedInvitations,recordAccepted,type DeliveryDatabase} from '../lib/invitation-store.ts';
async function fixture(){
 const database=new PGlite();
 await database.exec(`CREATE TABLE requests(id text PRIMARY KEY,created_at text); INSERT INTO requests VALUES('meeting',now()::text);
 CREATE TABLE invitation_outbox(id text PRIMARY KEY,meeting_id text,state text DEFAULT 'queued',lease_until timestamptz,attempt_token text,
 first_attempt_at timestamptz,attempts integer DEFAULT 0,provider text,retry_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),
 sent_at timestamptz,provider_id text,last_error text,last_error_code text);
 INSERT INTO invitation_outbox(id,meeting_id) VALUES('job','meeting');`);
 const db=(async(strings:TemplateStringsArray,...values:unknown[])=>{
  const query=strings.reduce((out,part,index)=>out+(index?'$'+index:'')+part,'');
  return (await database.query(query,values)).rows;
 }) as unknown as DeliveryDatabase;
 return {database,db};
}
test('database claims exclude already leased work and fence stale acknowledgements',async()=>{
 const {database,db}=await fixture();
 try{
  const first=await claimInvitations(db,'gmail','first','meeting');assert.equal(first.length,1);assert.equal(first[0].attempts,1);
  assert.equal((await claimInvitations(db,'gmail','second','meeting')).length,0);
  assert.equal((await recordAccepted(db,'job','wrong-token','message')).length,0);
  assert.equal((await recordAccepted(db,'job','first','message')).length,1);
  assert.equal((await claimInvitations(db,'gmail','third','meeting')).length,0);
 }finally{await database.close()}
});
test('scheduled backoff persists and only ready requests are claimed',async()=>{
 const {database,db}=await fixture();
 try{
  await database.exec("UPDATE invitation_outbox SET state='retry',provider='gmail',retry_at=now()+interval '1 hour'");
  assert.equal((await claimInvitations(db,'gmail','token','meeting')).length,0);
  await database.exec("UPDATE invitation_outbox SET retry_at=now()-interval '1 second'");
  assert.equal((await claimInvitations(db,'gmail','token','meeting')).length,1);
 }finally{await database.close()}
});
test('interrupted SMTP requires review while Resend retries stay within its key window',async()=>{
 const {database,db}=await fixture();
 try{
  await database.exec("UPDATE invitation_outbox SET state='sending',provider='gmail',attempts=1,first_attempt_at=now(),lease_until=now()-interval '1 minute'");
  await recoverInterruptedInvitations(db);
  assert.equal((await database.query<{state:string}>('SELECT state FROM invitation_outbox')).rows[0].state,'review');
  await database.exec("UPDATE invitation_outbox SET state='sending',provider='resend',lease_until=now()-interval '1 minute'");
  await recoverInterruptedInvitations(db);
  assert.equal((await database.query<{state:string}>('SELECT state FROM invitation_outbox')).rows[0].state,'retry');
  await database.exec("UPDATE invitation_outbox SET first_attempt_at=now()-interval '24 hours'");
  await recoverInterruptedInvitations(db);
  assert.equal((await database.query<{state:string}>('SELECT state FROM invitation_outbox')).rows[0].state,'review');
 }finally{await database.close()}
});
test('late worker success cannot overwrite a delivery event',async()=>{
 const {database,db}=await fixture();
 try{
  await claimInvitations(db,'resend','token','meeting');
  await database.exec("UPDATE invitation_outbox SET state='bounced'");
  assert.equal((await recordAccepted(db,'job','token','provider-id')).length,0);
 }finally{await database.close()}
});
