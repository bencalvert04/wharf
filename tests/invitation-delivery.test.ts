import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {deliverInvitationJobs} from '../lib/invitation-delivery.ts';
import type {CalendarDatabase} from '../lib/calendar-connection-store.ts';

async function fixture(){
 const database=new PGlite();
 await database.exec(`CREATE TABLE invitation_outbox(id text PRIMARY KEY,meeting_id text,payload jsonb,created_at timestamptz DEFAULT now(),lease_until timestamptz,first_attempt_at timestamptz,attempts integer DEFAULT 0,sent_at timestamptz,provider_id text,last_error text);INSERT INTO invitation_outbox(id,meeting_id,payload) VALUES('job','meeting','{}');`);
 let failAck=false;
 const db=(async(strings:TemplateStringsArray,...values:unknown[])=>{
  const query=strings.reduce((out,part,index)=>out+(index?'$'+index:'')+part,'');
  if(failAck&&query.includes('SET sent_at=now()')){failAck=false;throw Error('Database acknowledgment interrupted')}
  return (await database.query(query,values)).rows;
 }) as unknown as CalendarDatabase;
 return {database,db,failAcknowledgment:()=>{failAck=true}};
}
test('overlapping delivery workers send once; later retries leave the acknowledged job alone',async()=>{
 const {database,db}=await fixture();
 try{
  let calls=0,release!:()=>void,started!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve}),ready=new Promise<void>(resolve=>{started=resolve});
  const send=async()=>{calls++;started();await gate;return 'smtp-id'};
  const first=deliverInvitationJobs(db,send,'meeting');await ready;
  assert.deepEqual(await deliverInvitationJobs(db,send,'meeting'),{accepted:0,pending:1,needsReview:0});
  release();assert.deepEqual(await first,{accepted:1,pending:0,needsReview:0});
  assert.deepEqual(await deliverInvitationJobs(db,send,'meeting'),{accepted:0,pending:0,needsReview:0});
  assert.equal(calls,1);
  assert.equal((await database.query<{attempts:number}>('SELECT attempts FROM invitation_outbox')).rows[0].attempts,1);
 }finally{await database.close()}
});
for(const mode of ['smtp-response-lost','database-acknowledgment-lost'] as const)test(`${mode} requires review and never automatically resends, even after lease expiry`,async()=>{
 const {database,db,failAcknowledgment}=await fixture();
 try{
  let delivered=0;
  if(mode==='database-acknowledgment-lost')failAcknowledgment();
  const send=async()=>{delivered++;if(mode==='smtp-response-lost')throw Error('SMTP accepted, then socket reset');return 'smtp-id'};
  assert.deepEqual(await deliverInvitationJobs(db,send,'meeting'),{accepted:0,pending:1,needsReview:1});
  await database.exec("UPDATE invitation_outbox SET lease_until=now()-interval '1 hour'");
  assert.deepEqual(await deliverInvitationJobs(db,send,'meeting'),{accepted:0,pending:1,needsReview:1});
  assert.equal(delivered,1);
  const [row]=(await database.query<{attempts:number;sent_at:unknown;last_error:string}>('SELECT attempts,sent_at,last_error FROM invitation_outbox')).rows;
  assert.equal(row.attempts,1);assert.equal(row.sent_at,null);assert.match(row.last_error,/Review Gmail Sent/);
 }finally{await database.close()}
});
test('an abandoned claim becomes reviewable rather than resending; another meeting remains isolated',async()=>{
 const {database,db}=await fixture();
 try{
  await database.exec("UPDATE invitation_outbox SET first_attempt_at=now()-interval '1 hour',lease_until=now()-interval '1 minute',attempts=1;INSERT INTO invitation_outbox(id,meeting_id,payload) VALUES('other','other-meeting','{}')");
  let calls=0;
  assert.deepEqual(await deliverInvitationJobs(db,async()=>{calls++;return 'id'},'meeting'),{accepted:0,pending:1,needsReview:1});
  assert.equal(calls,0);
  const [other]=(await database.query<{attempts:number}>("SELECT attempts FROM invitation_outbox WHERE id='other'")).rows;
  assert.equal(other.attempts,0);
 }finally{await database.close()}
});
