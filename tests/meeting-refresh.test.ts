import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';
import {calendarIntentSchema} from '../db/calendar-intent-schema.mjs';
import {captureAccountIntent,runCalendarIntent,guardCalendarDatabase} from '../lib/calendar-intent.ts';
import {availabilityRefreshSchema} from '../db/availability-refresh-schema.mjs';
import {pendingMeetingSchema} from '../db/pending-meeting-schema.mjs';
import {claimMeetingRefresh,saveMeetingRefresh,failMeetingRefresh} from '../lib/meeting-refresh-store.ts';
import type {CalendarDatabase} from '../lib/calendar-connection-store.ts';
import {loadWithMocks} from './module-fixture.ts';

async function fixture(){
 const database=new PGlite();
 await database.exec(`CREATE TABLE requests(id text PRIMARY KEY,constraints text,created_at text,owner_session text,planner_name text,revision integer DEFAULT 0,final_time jsonb);
 CREATE TABLE sessions(id text PRIMARY KEY,name text);
 CREATE TABLE attendees(meeting_id text REFERENCES requests(id),google_sub text,name text,email text,busy jsonb,captured_at timestamptz DEFAULT now(),PRIMARY KEY(meeting_id,google_sub));
 CREATE TABLE request_invitees(meeting_id text,id text,name text,google_sub text);
 INSERT INTO requests(id,constraints,created_at) VALUES('meeting','{}',now()::text);
 INSERT INTO attendees(meeting_id,google_sub,name,busy) VALUES('meeting','google','Google guest','[]'),('meeting','manual:guest','Manual guest','[{"start":3,"end":4}]');`);
 for(const statement of [...pendingMeetingSchema,...availabilityRefreshSchema])await database.exec(statement);
 await database.exec("UPDATE requests SET last_activity_at=now()-interval '6 days'; INSERT INTO pending_meeting_dismissals VALUES('meeting','google:google',now())");
 const tag=(strings:TemplateStringsArray,...values:unknown[])=>{
  const query=strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,'');
  return {query,values,then:(resolve:any,reject:any)=>database.query(query,values).then(r=>r.rows).then(resolve,reject)};
 };
 const db=Object.assign(tag,{transaction:(queries:any[])=>database.transaction(async tx=>{const results=[];for(const q of queries)results.push((await tx.query(q.query,q.values)).rows);return results})}) as unknown as CalendarDatabase;
 return {database,db};
}
test('refresh preserves manual input, inactivity, and dismissed cards; deduplicates tabs and responds to joins',async()=>{
 const {database,db}=await fixture();try{
  const before=(await database.query('SELECT last_activity_at FROM requests')).rows;
  assert.ok(await claimMeetingRefresh(db,'meeting','first'));
  assert.equal(await claimMeetingRefresh(db,'meeting','second'),undefined);
  assert.equal(await claimMeetingRefresh(db,'meeting','second',true),undefined);
  assert.ok(await saveMeetingRefresh(db,'meeting','first',0,[{sub:'google',busy:[{start:10,end:20}]}]));
  assert.deepEqual((await database.query('SELECT last_activity_at FROM requests')).rows,before);
  assert.equal((await database.query('SELECT * FROM pending_meeting_dismissals')).rows.length,1);
  assert.deepEqual((await database.query("SELECT busy FROM attendees WHERE google_sub='manual:guest'")).rows,[{busy:[{start:3,end:4}]}]);
  assert.equal(await claimMeetingRefresh(db,'meeting','second'),undefined);
  assert.ok(await claimMeetingRefresh(db,'meeting','final-check',true));
  await failMeetingRefresh(db,'meeting','final-check','Failed');
  await database.exec('UPDATE requests SET revision=revision+1');
  assert.ok(await claimMeetingRefresh(db,'meeting','join'));
 }finally{await database.close()}
});
test('membership races, expired leases and finalized meetings cannot accept stale refresh results',async()=>{
 const {database,db}=await fixture();try{
  await claimMeetingRefresh(db,'meeting','first');
  await database.exec('UPDATE requests SET revision=1');
  assert.equal(await saveMeetingRefresh(db,'meeting','first',0,[{sub:'google',busy:[{start:1,end:2}]}]),undefined);
  await failMeetingRefresh(db,'meeting','first','Membership changed');
  await claimMeetingRefresh(db,'meeting','second',true);
  await database.exec("UPDATE meeting_availability_refresh SET lease_until=now()-interval '1 second'");
  assert.equal(await saveMeetingRefresh(db,'meeting','second',1,[{sub:'google',busy:[]}]),undefined);
  await claimMeetingRefresh(db,'meeting','third',true);
  await database.exec("UPDATE requests SET final_time='{}'");
  assert.equal(await saveMeetingRefresh(db,'meeting','third',1,[{sub:'google',busy:[]}]),undefined);
  assert.equal(await claimMeetingRefresh(db,'meeting','fourth',true),undefined);
  assert.deepEqual((await database.query("SELECT busy FROM attendees WHERE google_sub='google'")).rows,[{busy:[]}]);
 }finally{await database.close()}
});
for(const failed of [false,true])test(`provider ${failed?'failure preserves snapshots and blocks finalization':'success updates connected calendars only'}`,async()=>{
 const {database,db}=await fixture();let reads=0;
 try{
 const {refreshMeetingAvailability}=loadWithMocks<any>(new URL('../lib/meeting-refresh.ts',import.meta.url),{
  'node:crypto':{randomUUID},'./auth':{sql:()=>db,meeting:async()=>({constraints:'{}'})},
  './availability':{allowed:()=>[{start:0,end:100}]},
  './calendar-connection':{calendarConnection:async()=>({refresh_token:'encrypted'})},
  './provider-connections':{providerConnection:async()=>null},
  './google':{google:()=>({setCredentials:()=>{},request:async()=>{reads++;if(failed)throw Error('provider unavailable');return {data:{}}}}),parseBusy:()=>[{start:10,end:20}]},
  './token-vault':{openToken:()=> 'mock'},
  './calendar-intent':{captureAccountIntent:async()=>({expiresAt:'2099-01-01',accounts:[]}),runCalendarIntent:(_i:unknown,work:()=>unknown)=>work()},
  './meeting-refresh-store':{claimMeetingRefresh,saveMeetingRefresh,failMeetingRefresh},
 });
 if(failed)await assert.rejects(refreshMeetingAvailability('meeting',true),/Google guest/);else await refreshMeetingAvailability('meeting',true);
 assert.equal(reads,1);
 assert.deepEqual((await database.query("SELECT busy FROM attendees WHERE google_sub='google'")).rows,[{busy:failed?[]:[{start:10,end:20}]}]);
 const [status]=(await database.query<any>('SELECT * FROM meeting_availability_refresh')).rows;
 assert.equal(status.lease_id,null);assert.equal(!!status.last_error,failed);assert.equal(!!status.last_checked_at,!failed);
 }finally{await database.close()}
});

test('disconnecting a calendar during a provider read rejects the entire fetched batch',async()=>{
 const {database,db}=await fixture();try{
  await database.exec("ALTER TABLE sessions ADD COLUMN google_sub text; ALTER TABLE sessions ADD COLUMN expires_at timestamptz; CREATE TABLE oauth_states(id text); CREATE TABLE calendar_provider_states(id text); INSERT INTO sessions(id,google_sub,expires_at) VALUES('session','google',now()+interval '1 day')");
  for(const statement of calendarIntentSchema)await database.exec(statement);
  const {refreshMeetingAvailability}=loadWithMocks<any>(new URL('../lib/meeting-refresh.ts',import.meta.url),{
   'node:crypto':{randomUUID},'./auth':{sql:()=>guardCalendarDatabase(db),meeting:async()=>({constraints:'{}'})},
   './availability':{allowed:()=>[{start:0,end:100}]},
   './calendar-connection':{calendarConnection:async()=>({refresh_token:'encrypted'})},
   './provider-connections':{providerConnection:async()=>null},
   './google':{google:()=>({setCredentials:()=>{},request:async()=>{await database.query("SELECT wharf_begin_calendar_intent('session','google',true,true)");return {data:{}}}}),parseBusy:()=>[{start:10,end:20}]},
   './token-vault':{openToken:()=> 'mock'},
   './calendar-intent':{captureAccountIntent,runCalendarIntent},
   './meeting-refresh-store':{claimMeetingRefresh,saveMeetingRefresh,failMeetingRefresh},
  });
  await assert.rejects(refreshMeetingAvailability('meeting',true),/Calendar access changed/);
  assert.deepEqual((await database.query("SELECT busy FROM attendees WHERE google_sub='google'")).rows,[{busy:[]}]);
  assert.equal((await database.query<any>('SELECT last_checked_at FROM meeting_availability_refresh')).rows[0].last_checked_at,null);
 }finally{await database.close()}
});
