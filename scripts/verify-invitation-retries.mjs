// Run only against the already-approved, isolated Wharf staging database.
// Provider delivery is fault-injected: this script sends no email or calendar requests.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {freezeEmailMeeting} from '../lib/email-finalization-store.ts';
import {deliverInvitationJobs} from '../lib/invitation-delivery.ts';

assert.equal(process.env.APP_URL,'https://wharf-calendar-staging.vercel.app','Wrong app target');
assert.equal(new URL(process.env.DATABASE_URL).hostname,'ep-divine-dream-bc9upssq-pooler.c-16.us-east-1.aws.neon.tech','Wrong database target');
const database=neon(process.env.DATABASE_URL);
const schema='retry_test_'+randomUUID().replaceAll('-','');
const tables=/\b(requests|attendees|google_meeting_events|invitation_outbox)\b/g;
const scoped=query=>query.replace(tables,table=>`"${schema}".${table}`);
let failAck=false;
const db=Object.assign((strings,...values)=>{
 const query=strings.reduce((out,part,index)=>out+(index?'$'+index:'')+part,'');
 if(failAck&&query.includes('SET sent_at=now()')){failAck=false;throw Error('Injected lost database acknowledgment')}
 return database.query(scoped(query),values);
},{transaction:queries=>database.transaction(queries)});
const people=[{google_sub:'microsoft:dummy',name:'Dummy Outlook',email:'outlook@example.test',busy:[]},{google_sub:'google-dummy',name:'Dummy Google',email:'google@example.test',busy:[]}];
const recipients=people.map(p=>({email:p.email,payload:{to:p.email}}));
async function seed(id){
 await db`INSERT INTO requests(id) VALUES(${id})`;
 for(const p of people)await db`INSERT INTO attendees VALUES(${id},${p.google_sub},${p.name},${p.email},${JSON.stringify(p.busy)}::jsonb)`;
}
try{
 await database.query(`CREATE SCHEMA "${schema}"`);
 await database.query(scoped(`CREATE TABLE requests(id text PRIMARY KEY,final_time jsonb,revision integer DEFAULT 0)`));
 await database.query(scoped(`CREATE TABLE attendees(meeting_id text,google_sub text,name text,email text,busy jsonb)`));
 await database.query(scoped(`CREATE TABLE google_meeting_events(meeting_id text PRIMARY KEY)`));
 await database.query(scoped(`CREATE TABLE invitation_outbox(id text PRIMARY KEY,meeting_id text REFERENCES requests(id),recipient_key text,payload jsonb NOT NULL,created_at timestamptz DEFAULT now(),lease_until timestamptz,first_attempt_at timestamptz,attempts integer DEFAULT 0,sent_at timestamptz,provider_id text,last_error text,UNIQUE(meeting_id,recipient_key))`));

 await seed('race');
 const freezes=await Promise.all([freezeEmailMeeting(db,'race',people,1000,2000,recipients),freezeEmailMeeting(db,'race',people,1000,2000,recipients)]);
 assert.deepEqual(freezes.sort(),[false,true]);
 assert.equal(await freezeEmailMeeting(db,'race',people,1000,2000,recipients),false);
 let sends=0;
 const send=async(_payload,id)=>{sends++;return 'test-'+id};
 await Promise.all([deliverInvitationJobs(db,send,'race'),deliverInvitationJobs(db,send,'race')]);
 assert.equal(sends,2);
 assert.deepEqual(await deliverInvitationJobs(db,send,'race'),{accepted:0,pending:0,needsReview:0});
 assert.equal(sends,2);
 console.log('PASS: concurrent finalization, repeated finalization, overlapping delivery, and successful retry isolation');

 for(const mode of ['smtp-response-lost','database-acknowledgment-lost']){
  await seed(mode);await freezeEmailMeeting(db,mode,people,1000,2000,recipients);
  let calls=0;
  if(mode==='database-acknowledgment-lost')failAck=true;
  const ambiguous=async(_payload,id)=>{calls++;if(mode==='smtp-response-lost')throw Error('Accepted then response lost');return 'test-'+id};
  const first=await deliverInvitationJobs(db,ambiguous,mode);
  assert.equal(first.needsReview,mode==='smtp-response-lost'?2:1);
  await db`UPDATE invitation_outbox SET lease_until=now()-interval '1 hour' WHERE meeting_id=${mode} AND sent_at IS NULL`;
  const retry=await deliverInvitationJobs(db,ambiguous,mode);
  assert.equal(retry.accepted,0);assert.equal(retry.needsReview,first.needsReview);assert.equal(calls,2);
  const rows=await db`SELECT attempts FROM invitation_outbox WHERE meeting_id=${mode}`;
  assert.ok(rows.every(r=>r.attempts===1));
  console.log('PASS: '+mode+' requires review and does not resend after lease expiry');
 }

 await seed('rollback');
 await assert.rejects(freezeEmailMeeting(db,'rollback',people,1000,2000,[{email:'dummy@example.test',payload:undefined}]));
 const [rollback]=await db`SELECT final_time FROM requests WHERE id='rollback'`;
 assert.equal(rollback.final_time,null);
 assert.equal((await db`SELECT id FROM invitation_outbox WHERE meeting_id='rollback'`).length,0);
 console.log('PASS: queue failure atomically rolls back meeting confirmation');
}finally{
 await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
 console.log('Disposable staging test schema removed.');
}
