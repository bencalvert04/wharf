import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {calendarIntentSchema} from '../db/calendar-intent-schema.mjs';
import {beginCalendarIntent,bindCalendarAccount,captureAccountIntent,captureSessionIntent,guardCalendarDatabase,runCalendarIntent} from '../lib/calendar-intent.ts';
import type {CalendarDatabase} from '../lib/calendar-connection-store.ts';

async function fixture(){
 const database=new PGlite();
 await database.exec(`CREATE TABLE sessions(id text PRIMARY KEY,google_sub text,expires_at timestamptz);CREATE TABLE oauth_states(id text);CREATE TABLE calendar_provider_states(id text);CREATE TABLE effects(value text);INSERT INTO sessions VALUES('one','account',now()+interval '1 day'),('two','account',now()+interval '1 day'),('anonymous',NULL,now()+interval '1 day');`);
 for(const statement of calendarIntentSchema)await database.exec(statement);
 // Match Neon's lazy query contract: building queries must not execute them.
 const raw=Symbol('query');
 const query=(text:string,values:unknown[]=[])=>({[raw]:{text,values},then:(resolve:any,reject:any)=>database.query(text,values).then(r=>r.rows).then(resolve,reject)});
 const db=((parts:TemplateStringsArray,...values:unknown[])=>query(parts.reduce((out,part,index)=>out+(index?'$'+index:'')+part,''),values)) as any;
 db.query=query;
 db.transaction=(queries:any[],_options?:unknown)=>database.transaction(async tx=>{const result=[];for(const q of queries){const {text,values}=q[raw];result.push((await tx.query(text,values)).rows)}return result});
 return {database,db:db as CalendarDatabase};
}

test('account tombstone rejects older cross-session completion even without a credential row',async()=>{
 const {database,db}=await fixture();try{
  const older=await beginCalendarIntent(db,'one','account');
  await beginCalendarIntent(db,'two','account'); // disconnect/new action, no credential row needed
  await assert.rejects(runCalendarIntent(older,async()=>{const guarded=guardCalendarDatabase(db);await guarded`INSERT INTO effects VALUES('stale snapshot')`}),/changed/);
  assert.equal((await database.query('SELECT * FROM effects')).rows.length,0);
 }finally{await database.close()}
});
test('logout then same-account login cannot revive the old session intent (ABA)',async()=>{
 const {database,db}=await fixture();try{
  const older=await beginCalendarIntent(db,'one','account');
  const logout=await beginCalendarIntent(db,'one','account',false);
  await runCalendarIntent(logout,async()=>{await guardCalendarDatabase(db)`UPDATE sessions SET google_sub=NULL WHERE id='one'`});
  const login=await beginCalendarIntent(db,'one',null);
  await runCalendarIntent(login,async()=>{const guarded=guardCalendarDatabase(db);await bindCalendarAccount(guarded,'account');await guarded`UPDATE sessions SET google_sub='account' WHERE id='one'`});
  await assert.rejects(runCalendarIntent(older,async()=>{await guardCalendarDatabase(db)`INSERT INTO effects VALUES('stale session write')`}),/changed/);
  assert.equal((await database.query('SELECT * FROM effects')).rows.length,0);
 }finally{await database.close()}
});
test('late identity binding uses sequence order and cannot pass a newer account disconnect',async()=>{
 const {database,db}=await fixture();try{
  const anonymous=await beginCalendarIntent(db,'anonymous',null);
  await beginCalendarIntent(db,'two','account');
  await assert.rejects(runCalendarIntent(anonymous,()=>bindCalendarAccount(guardCalendarDatabase(db),'account')),/newer calendar action/);
  const newer=await beginCalendarIntent(db,'anonymous',null);
  await runCalendarIntent(newer,async()=>{const guarded=guardCalendarDatabase(db);await bindCalendarAccount(guarded,'account');await guarded`INSERT INTO effects VALUES('new connection')`});
  assert.deepEqual((await database.query('SELECT value FROM effects')).rows,[{value:'new connection'}]);
 }finally{await database.close()}
});
test('guard and actual multi-statement mutations share one rollback boundary; queries remain lazy',async()=>{
 const {database,db}=await fixture();try{
  const intent=await beginCalendarIntent(db,'one','account');
  await runCalendarIntent(intent,async()=>{
   const guarded=guardCalendarDatabase(db),write=guarded`INSERT INTO effects VALUES('first')`;
   assert.equal((await database.query('SELECT * FROM effects')).rows.length,0);
   await assert.rejects(guarded.transaction([write,guarded`SELECT 1/0`]),/division by zero/);
   assert.equal((await database.query('SELECT * FROM effects')).rows.length,0);
   await guarded.transaction([guarded`INSERT INTO effects VALUES('session')`,guarded`INSERT INTO effects VALUES('snapshot')`]);
  });
  assert.equal((await database.query('SELECT * FROM effects')).rows.length,2);
 }finally{await database.close()}
});
test('background account vector aborts final write after any observed account changes',async()=>{
 const {database,db}=await fixture();try{
  const first=await captureAccountIntent(db,'account'),second=await captureAccountIntent(db,'other');
  const vector={expiresAt:first.expiresAt,sessionId:null,sequence:null,accounts:[...first.accounts,...second.accounts]};
  await beginCalendarIntent(db,'two','account');
  await assert.rejects(runCalendarIntent(vector,async()=>{await guardCalendarDatabase(db)`INSERT INTO effects VALUES('refresh batch')`}),/changed/);
  assert.equal((await database.query('SELECT * FROM effects')).rows.length,0);
  // Tombstones survive credential deletion: the table has no credential FK.
  assert.equal((await database.query('SELECT * FROM calendar_account_intents')).rows.length,2);
 }finally{await database.close()}
});
test('migration is additive/idempotent and legacy OAuth intents fail closed',async()=>{
 const {database,db}=await fixture();try{
  for(const statement of calendarIntentSchema)await database.exec(statement);
  await assert.rejects(async()=>await db`SELECT wharf_assert_calendar_intent(NULL)`,/expired/);
  for(const malformed of [{sessionId:'missing',sequence:null,accounts:[]},{sessionId:null,sequence:null,accounts:[{account:'missing'}]},{sessionId:null,sequence:null,accounts:[]}])await assert.rejects(async()=>await db`SELECT wharf_assert_calendar_intent(${JSON.stringify({...malformed,expiresAt:new Date(Date.now()+60000).toISOString()})}::jsonb)`,/Invalid/);
  assert.equal((await database.query<{count:number}>('SELECT count(*)::int AS count FROM sessions')).rows[0].count,3);
 }finally{await database.close()}
});

for(const provider of ['google','microsoft'])test(`${provider} callback rejects an already-stale intent before exchanging a provider code`,async()=>{
 const {database,db}=await fixture();let transport=0;
 try{
  const old=await beginCalendarIntent(db,'one','account');
  await beginCalendarIntent(db,'two','account');
  const flow={calendar_intent:old,expected_account:'account',expected_sub:'account',nonce:'nonce'};
  const routeDb=Object.assign((strings:TemplateStringsArray,...values:unknown[])=>strings.join('').includes('DELETE FROM')?Promise.resolve([flow]):(db as any)(strings,...values),{query:db.query,transaction:db.transaction}) as CalendarDatabase;
  const intentModule=await import('../lib/calendar-intent.ts');
  const {loadWithMocks}=await import('./module-fixture.ts');
  const common={
   '@/lib/calendar-intent':intentModule,
   '@/lib/auth':{session:async()=>({id:'one',google_sub:'account'}),sql:()=>guardCalendarDatabase(routeDb),hash:(x:string)=>x,appUrl:()=> 'https://wharf.example'},
   '@/lib/calendar-invitation':{},
  };
  const mocks=provider==='google'?{
   ...common,'@/lib/provider-switch-guard':{isStandaloneProviderAccount:()=>false,captureGoogleSwitch:async()=>({check:async()=>{},remove:async()=>{}})},
   '@/lib/planner-access':{},'next/server':{},'@/lib/slack-workflow':{},'@/lib/slack-attendance':{},'@/lib/agent-calendar-authorization':{},'@/lib/google-event-payload':{},'@/lib/google':{google:()=>({getToken:async()=>{transport++;throw Error('Unexpected provider call')}})},'@/lib/google-flow':{},'@/lib/calendar-connection':{},'@/lib/calendar-access':{},
  }:{...common,'@/lib/microsoft-calendar':{microsoftTokens:async()=>{transport++;throw Error('Unexpected provider call')}},'@/lib/provider-connections':{},'@/lib/provider-flow':{}};
  const route=loadWithMocks<{GET:(r:Request)=>Promise<Response>}>(new URL(`../app/api/auth/${provider}/callback/route.ts`,import.meta.url),mocks);
  const response=await route.GET(new Request(`https://wharf.example/api/auth/${provider}/callback?state=state&code=code`));
  assert.equal(new URL(response.headers.get('location')!).searchParams.get('calendar'),'failed');assert.equal(transport,0);
 }finally{await database.close()}
});


test('legacy signed-in sessions lazily acquire a session epoch without invalidating saved account access',async()=>{
 const {database,db}=await fixture();try{
  const before=await captureAccountIntent(db,'account');
  const intent=await captureSessionIntent(db,'one','account');
  assert.ok(Number(intent.sequence!)>0);assert.deepEqual(intent.accounts,before.accounts);
  await runCalendarIntent(intent,async()=>{await guardCalendarDatabase(db)`INSERT INTO effects VALUES('legacy saved join')`});
  assert.equal((await database.query('SELECT * FROM effects')).rows.length,1);
  await runCalendarIntent(intent,async()=>{const guarded=guardCalendarDatabase(db);assert.throws(()=>guarded.transaction([guarded`SELECT 1`],{isolationLevel:'RepeatableRead'}),/ReadCommitted/)});
 }finally{await database.close()}
});


test('expired zero-generation context cannot revive after marker cleanup and recreation',async()=>{
 const {database,db}=await fixture();try{
  const old=await captureAccountIntent(db,'account');assert.equal(old.accounts[0].sequence,'0');
  // Simulate advancing DB time beyond both original deadlines, without waiting.
  old.expiresAt=(await database.query<{expired:string}>("SELECT (clock_timestamp()-interval '1 second')::text AS expired")).rows[0].expired;
  await database.exec("UPDATE calendar_account_intents SET expires_at=clock_timestamp()-interval '1 second'");
  const removed=await db`SELECT wharf_cleanup_calendar_intents() AS count`;assert.equal(Number(removed[0].count),1);
  const fresh=await captureAccountIntent(db,'account');assert.equal(fresh.accounts[0].sequence,'0');
  await assert.rejects(runCalendarIntent(old,async()=>{await guardCalendarDatabase(db)`INSERT INTO effects VALUES('resurrected')`}),/expired/);
  await runCalendarIntent(fresh,async()=>{await guardCalendarDatabase(db)`INSERT INTO effects VALUES('fresh')`});
  assert.deepEqual((await database.query('SELECT * FROM effects')).rows,[{value:'fresh'}]);
 }finally{await database.close()}
});
test('binding preserves original deadline and cleanup never removes a live marker',async()=>{
 const {database,db}=await fixture();try{
  const intent=await beginCalendarIntent(db,'anonymous',null),deadline=intent.expiresAt;
  await runCalendarIntent(intent,async()=>{await bindCalendarAccount(guardCalendarDatabase(db),'account')});
  assert.equal(intent.expiresAt,deadline);
  const [removed]=await db`SELECT wharf_cleanup_calendar_intents() AS count`;assert.equal(Number(removed.count),0);
  const [margin]=await db`SELECT expires_at>${deadline}::timestamptz AS protected FROM calendar_account_intents`;
  assert.equal(margin.protected,true);
  await runCalendarIntent(intent,async()=>{await guardCalendarDatabase(db)`INSERT INTO effects VALUES('protected through cleanup')`});
  intent.expiresAt=(await database.query<{expired:string}>("SELECT (clock_timestamp()-interval '1 second')::text AS expired")).rows[0].expired;
  await assert.rejects(runCalendarIntent(intent,()=>bindCalendarAccount(guardCalendarDatabase(db),'other')),/expired/);
  assert.equal((await database.query('SELECT * FROM calendar_account_intents')).rows.length,1);
 }finally{await database.close()}
});
