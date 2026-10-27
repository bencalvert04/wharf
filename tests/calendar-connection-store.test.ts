import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {calendarConnectionSchema} from '../db/calendar-connection-schema.mjs';
import {prepareCalendarConnection,storeCalendarGrant,disconnectCalendarConnection,type CalendarDatabase} from '../lib/calendar-connection-store.ts';

async function fixture(){
 const database=new PGlite();
 await database.exec(`CREATE TABLE google_calendar_connections(google_sub text PRIMARY KEY,refresh_token text,version integer NOT NULL DEFAULT 0,disconnecting boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now(),granted_scopes text);
 CREATE TABLE oauth_states(id text PRIMARY KEY,expected_sub text,connection_version integer);
 CREATE TABLE attendees(google_sub text,busy jsonb);
 INSERT INTO attendees VALUES('person','[]');`);
 for(const statement of calendarConnectionSchema)await database.exec(statement);
 const db=(async(strings:TemplateStringsArray,...values:unknown[])=>{
  const query=strings.reduce((out,part,index)=>out+(index?'$'+index:'')+part,'');
  return (await database.query(query,values)).rows;
 }) as unknown as CalendarDatabase;
 const generation=await prepareCalendarConnection(db,'person');
 await storeCalendarGrant(db,'person','encrypted-token',generation,'freebusy');
 await database.query('INSERT INTO oauth_states VALUES($1,$2,$3,$4)',['flow','person',generation.version,generation.connectionId]);
 return {database,db,generation};
}
test('successful disconnect deletes all connection metadata and pending consent, not snapshots or another account',async()=>{
 const {database,db}=await fixture();
 try{
  await prepareCalendarConnection(db,'other');
  const tokens:string[]=[];
  await disconnectCalendarConnection(db,'person',async token=>{tokens.push(token)});
  assert.deepEqual(tokens,['encrypted-token']);
  assert.deepEqual((await database.query('SELECT google_sub FROM google_calendar_connections')).rows,[{google_sub:'other'}]);
  assert.deepEqual((await database.query('SELECT * FROM oauth_states')).rows,[]);
  assert.equal((await database.query('SELECT * FROM attendees')).rows.length,1);
  await disconnectCalendarConnection(db,'person',async()=>assert.fail('Repeated disconnect must not revoke'));
 }finally{await database.close()}
});
test('a connection without a token is deleted without contacting Google',async()=>{
 const {database,db}=await fixture();
 try{
  await database.exec('UPDATE google_calendar_connections SET refresh_token=NULL');
  await disconnectCalendarConnection(db,'person',async()=>assert.fail('No token'));
  assert.deepEqual((await database.query<{disconnecting:boolean;refresh_token:string}>('SELECT * FROM google_calendar_connections')).rows,[]);
 }finally{await database.close()}
});
test('provider failure pauses access, keeps credentials for retry, and a successful retry deletes metadata',async()=>{
 const {database,db,generation}=await fixture();
 try{
  await assert.rejects(disconnectCalendarConnection(db,'person',async()=>{throw Error('Provider unavailable')}),/Provider unavailable/);
  const [row]=(await database.query<{disconnecting:boolean;refresh_token:string}>('SELECT * FROM google_calendar_connections')).rows;
  assert.equal(row.disconnecting,true);assert.equal(row.refresh_token,'encrypted-token');
  await assert.rejects(prepareCalendarConnection(db,'person'),/pending/);
  await assert.rejects(storeCalendarGrant(db,'person','stale',generation,''),/changed/);
  await disconnectCalendarConnection(db,'person',async()=>{});
  assert.deepEqual((await database.query<{disconnecting:boolean;refresh_token:string}>('SELECT * FROM google_calendar_connections')).rows,[]);
 }finally{await database.close()}
});
test('an old callback cannot overwrite a reconnected account even when its numeric version repeats',async()=>{
 const {database,db,generation}=await fixture();
 try{
  await disconnectCalendarConnection(db,'person',async()=>{});
  const reconnected=await prepareCalendarConnection(db,'person');
  assert.equal(reconnected.version,generation.version);assert.notEqual(reconnected.connectionId,generation.connectionId);
  await storeCalendarGrant(db,'person','new-token',reconnected,'new-scope');
  await assert.rejects(storeCalendarGrant(db,'person','stale-token',generation,'old-scope'),/changed/);
  await assert.rejects(storeCalendarGrant(db,'person','legacy-token',{version:0,connectionId:undefined!},''),/changed/);
  assert.equal((await database.query<{refresh_token:string}>('SELECT refresh_token FROM google_calendar_connections')).rows[0].refresh_token,'new-token');
 }finally{await database.close()}
});
test('overlapping disconnects do not start a second revocation and reconnect waits for completion',async()=>{
 const {database,db}=await fixture();
 let release!:()=>void,started!:()=>void;
 const entered=new Promise<void>(resolve=>{started=resolve});
 const barrier=new Promise<void>(resolve=>{release=resolve});
 try{
  const first=disconnectCalendarConnection(db,'person',async()=>{started();await barrier});
  await entered;
  await assert.rejects(disconnectCalendarConnection(db,'person',async()=>assert.fail('Concurrent revoke')),/already in progress/);
  await assert.rejects(prepareCalendarConnection(db,'person'),/pending/);
  release();await first;
  const generation=await prepareCalendarConnection(db,'person');
  await storeCalendarGrant(db,'person','new-token',generation,'');
 }finally{release();await database.close()}
});
test('a stale disconnect completion cannot delete a replacement generation',async()=>{
 const {database,db}=await fixture();
 try{
  await assert.rejects(disconnectCalendarConnection(db,'person',async()=>{
   // Model a stalled worker after a newer attempt completed and the user reconnected.
   await database.exec('DELETE FROM google_calendar_connections');
   const fresh=await prepareCalendarConnection(db,'person');
   await storeCalendarGrant(db,'person','replacement-token',fresh,'new-scope');
  }),/changed during disconnection/);
  assert.equal((await database.query<{refresh_token:string}>('SELECT refresh_token FROM google_calendar_connections')).rows[0].refresh_token,'replacement-token');
 }finally{await database.close()}
});
test('schema additions are repeatable, preserve existing grants, and expired worker claims can be retried',async()=>{
 const {database,db,generation}=await fixture();
 try{
  for(const statement of calendarConnectionSchema)await database.exec(statement);
  assert.equal((await database.query<{connection_id:string}>('SELECT connection_id FROM google_calendar_connections')).rows[0].connection_id,generation.connectionId);
  await database.exec("UPDATE google_calendar_connections SET disconnecting=true,updated_at=now()-interval '31 seconds'");
  await disconnectCalendarConnection(db,'person',async()=>{});
  assert.deepEqual((await database.query<{disconnecting:boolean;refresh_token:string}>('SELECT * FROM google_calendar_connections')).rows,[]);
 }finally{await database.close()}
});
test('a worker that loses its claim during pre-revoke DB work never calls Google',async()=>{
 const {database,db}=await fixture();
 try{
  const delayedDb=(async(strings:TemplateStringsArray,...values:unknown[])=>{
   const result=await db(strings,...values as any[]);
   if(strings.join('').includes('DELETE FROM oauth_states')){
    await database.exec('DELETE FROM google_calendar_connections');
    const fresh=await prepareCalendarConnection(db,'person');
    await storeCalendarGrant(db,'person','replacement-token',fresh,'new-scope');
   }
   return result;
  }) as unknown as CalendarDatabase;
  await assert.rejects(disconnectCalendarConnection(delayedDb,'person',async()=>assert.fail('Lost claim must not revoke')),/claim changed/);
  assert.equal((await database.query<{refresh_token:string}>('SELECT refresh_token FROM google_calendar_connections')).rows[0].refresh_token,'replacement-token');
 }finally{await database.close()}
});
test('provider deadline includes pre-revocation DB work, preventing late revocation after a stalled claim',async(t)=>{
 const {database,db}=await fixture();
 try{
  const now=Date.now();let calls=0;
  t.mock.method(Date,'now',()=>calls++===0?now:now+11000);
  await assert.rejects(disconnectCalendarConnection(db,'person',async()=>assert.fail('Expired claim must not revoke')),/timed out/);
  assert.equal((await database.query<{disconnecting:boolean}>('SELECT disconnecting FROM google_calendar_connections')).rows[0].disconnecting,true);
 }finally{t.mock.restoreAll();await database.close()}
});
test('additive migration backfills a legacy grant without changing credentials and legacy callbacks fail closed',async()=>{
 const database=new PGlite();
 try{
  await database.exec(`CREATE TABLE google_calendar_connections(google_sub text PRIMARY KEY,refresh_token text,version integer NOT NULL DEFAULT 0,disconnecting boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now(),granted_scopes text);
   CREATE TABLE oauth_states(id text PRIMARY KEY,expected_sub text,connection_version integer);
   INSERT INTO google_calendar_connections(google_sub,refresh_token,granted_scopes) VALUES('legacy','preserved-token','preserved-scope');
   INSERT INTO oauth_states VALUES('old-flow','legacy',0);`);
  for(const statement of calendarConnectionSchema)await database.exec(statement);
  const [row]=(await database.query<{refresh_token:string;granted_scopes:string;connection_id:string}>('SELECT * FROM google_calendar_connections')).rows;
  assert.equal(row.refresh_token,'preserved-token');assert.equal(row.granted_scopes,'preserved-scope');assert.match(row.connection_id,/^[0-9a-f-]{36}$/);
  assert.equal((await database.query<{connection_id:string|null}>('SELECT connection_id FROM oauth_states')).rows[0].connection_id,null);
  const result=await database.query("UPDATE google_calendar_connections SET refresh_token='stale-token' WHERE google_sub='legacy' AND version=0 AND connection_id=$1::uuid RETURNING google_sub",[null]);
  assert.equal(result.rows.length,0);
 }finally{await database.close()}
});
