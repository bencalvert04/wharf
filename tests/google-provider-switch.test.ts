import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {captureGoogleSwitch,isStandaloneProviderAccount} from '../lib/provider-switch-guard.ts';
import {loadWithMocks} from './module-fixture.ts';
import type {CalendarDatabase} from '../lib/calendar-connection-store.ts';

async function fixture(account:string|null='google-user'){
 const database=new PGlite();
 await database.exec(`CREATE TABLE sessions(id text PRIMARY KEY,google_sub text,name text,picture text,email text,expires_at timestamptz);CREATE TABLE calendar_provider_connections(account_id text PRIMARY KEY,connection_id uuid,credential text);`);
 await database.query("INSERT INTO sessions VALUES('session',$1,'Person',NULL,'person@example.test',now()+interval '1 day')",[account]);
 const db=(async(strings:TemplateStringsArray,...values:unknown[])=>{
  const query=strings.reduce((out,part,index)=>out+(index?'$'+index:'')+part,'');
  return (await database.query(query,values)).rows;
 }) as unknown as CalendarDatabase;
 return {database,db};
}
// These route tests isolate existing generation guards; calendar-intent.test.ts
// exercises the real transaction protocol and ABA/late-binding invariants.
const intentMock={beginCalendarIntent:async()=>({}),runCalendarIntent:(_intent:unknown,work:()=>Promise<unknown>)=>work(),bindCalendarAccount:async()=>{},currentCalendarIntent:()=>({})};
const oldId='11111111-1111-4111-8111-111111111111',newId='22222222-2222-4222-8222-222222222222';

test('Google switch guard rejects newer grants, including a grant created after an empty capture',async()=>{
 for(const existing of [true,false]){
  const {database,db}=await fixture();try{
   if(existing)await database.query('INSERT INTO calendar_provider_connections VALUES($1,$2,$3)',['google-user',oldId,'old']);
   const guard=await captureGoogleSwitch(db,'google-user','session','google-user');
   await database.query('INSERT INTO calendar_provider_connections VALUES($1,$2,$3) ON CONFLICT(account_id) DO UPDATE SET connection_id=EXCLUDED.connection_id,credential=EXCLUDED.credential',['google-user',newId,'new']);
   await assert.rejects(guard.check(),/changed/);await assert.rejects(guard.remove(),/changed/);
   assert.equal((await database.query<{credential:string}>('SELECT credential FROM calendar_provider_connections')).rows[0].credential,'new');
  }finally{await database.close()}
 }
});
test('Google switch guard removes only its unchanged generation and rejects signed-out sessions',async()=>{
 const {database,db}=await fixture();try{
  await database.query('INSERT INTO calendar_provider_connections VALUES($1,$2,$3)',['google-user',oldId,'old']);
  const guard=await captureGoogleSwitch(db,'google-user','session','google-user');
  await guard.check();await guard.remove();
  assert.equal((await database.query('SELECT * FROM calendar_provider_connections')).rows.length,0);
  const empty=await captureGoogleSwitch(db,'google-user','session','google-user');
  await database.exec('UPDATE sessions SET google_sub=NULL');await assert.rejects(empty.check(),/changed/);
 }finally{await database.close()}
});

for(const interleaving of ['availability','tokens','unchanged','google-account-switch'] as const)test(`actual Google callback guards ${interleaving} completion without regressing unchanged Google joins`,async()=>{
 const {database,db}=await fixture();let snapshots=0;
 try{
  await database.query('INSERT INTO calendar_provider_connections VALUES($1,$2,$3)',['google-user',oldId,'old']);
  const calendar=loadWithMocks<{saveCalendarSnapshot:Function}>(new URL('../lib/calendar-connection.ts',import.meta.url),{
   './calendar-intent':intentMock,'./provider-connections':{},'./auth':{sql:()=>db},'./meeting-participation':{persistCalendarSnapshot:async()=>{snapshots++}},
   './google':{parseBusy:()=>[]},'./availability':{allowed:()=>[{start:0,end:1000}]},'./token-vault':{},'./calendar-access':{},'./calendar-connection-store':{},
  });
  const client={getToken:async()=>{if(interleaving==='tokens'){await database.query('UPDATE calendar_provider_connections SET connection_id=$1,credential=$2',[newId,'new-outlook']);await database.exec("UPDATE sessions SET name='New Outlook'")}return {tokens:{id_token:'id',access_token:'access',refresh_token:'refresh',scope:'freebusy'}}},verifyIdToken:async()=>({getPayload:()=>({sub:interleaving==='google-account-switch'?'google-second':'google-user',email_verified:true,email:'person@example.test',nonce:'nonce',name:'Person'})}),setCredentials:()=>{},request:async()=>{
   if(interleaving==='availability')await database.query('UPDATE calendar_provider_connections SET connection_id=$1,credential=$2',[newId,'new-outlook']);return {data:{}};
  }};
  const routeDb=((strings:TemplateStringsArray,...values:unknown[])=>strings.join('').includes('DELETE FROM oauth_states')?Promise.resolve([{calendar_intent:{},meeting_id:'meeting',expected_sub:interleaving==='google-account-switch'?null:'google-user',nonce:'nonce',verifier:'verifier',connection_version:1,connection_id:oldId}]):(db as Function)(strings,...values)) as CalendarDatabase;
  const {GET}=loadWithMocks<{GET:(r:Request)=>Promise<Response>}>(new URL('../app/api/auth/google/callback/route.ts',import.meta.url),{
   '@/lib/calendar-intent':intentMock,'@/lib/provider-switch-guard':{captureGoogleSwitch,isStandaloneProviderAccount},'@/lib/planner-access':{},'next/server':{},'@/lib/slack-workflow':{},'@/lib/slack-attendance':{},'@/lib/agent-calendar-authorization':{},'@/lib/google-event-payload':{},
   '@/lib/auth':{session:async()=>({id:'session',google_sub:'google-user'}),sql:()=>routeDb,hash:(x:string)=>x,meeting:async()=>({id:'meeting',constraints:'{}'}),appUrl:()=> 'https://wharf.example'},
   '@/lib/calendar-invitation':{validEmail:()=>true},'@/lib/google':{google:()=>client},'@/lib/google-flow':{},'@/lib/calendar-connection':{saveCalendarGrant:async()=>{},saveCalendarSnapshot:calendar.saveCalendarSnapshot,joinWithSavedCalendar:async(row:unknown,sub:string,name:string,sessionId:string,inviteeId:unknown,googleOnly:boolean,check:()=>Promise<void>)=>{await check();snapshots++;return true}},'@/lib/calendar-access':{grantHasFreeBusy:()=>true},
  });
  const response=await GET(new Request('https://wharf.example/api/auth/google/callback?state=state&code=code'));
  assert.equal(new URL(response.headers.get('location')!).searchParams.get('calendar'),['unchanged','google-account-switch'].includes(interleaving)?'joined':'failed');assert.equal(snapshots,['unchanged','google-account-switch'].includes(interleaving)?1:0);
  const connections=(await database.query<{credential:string}>('SELECT credential FROM calendar_provider_connections')).rows;
  if(interleaving==='unchanged')assert.equal(connections.length,0);else assert.equal(connections[0].credential,interleaving==='google-account-switch'?'old':'new-outlook');
  if(interleaving==='google-account-switch')assert.equal((await database.query<{google_sub:string}>('SELECT google_sub FROM sessions')).rows[0].google_sub,'google-second');
  if(interleaving==='tokens')assert.equal((await database.query<{name:string}>('SELECT name FROM sessions')).rows[0].name,'New Outlook');
 }finally{await database.close()}
});

test('Google start rejects standalone provider linking before state, identity, or membership mutation',async()=>{
 for(const account of ['microsoft:A','icloud:A']){
  let writes=0;
  const {POST}=loadWithMocks<{POST:(r:Request)=>Promise<Response>}>(new URL('../app/api/auth/google/start/route.ts',import.meta.url),{
   '@/lib/calendar-intent':intentMock,'@/lib/provider-switch-guard':{captureGoogleSwitch,isStandaloneProviderAccount},
   '@/lib/auth':{sameOrigin:()=>true,json:(data:unknown,status=200)=>Response.json(data,{status}),session:async()=>({id:'session',google_sub:account}),sql:()=>()=>{writes++;throw Error('Unexpected mutation')}},
   '@/lib/google':{configured:()=>true},'@/lib/google-flow':{},'@/lib/calendar-connection':{},'@/lib/meeting-participation':{},'@/lib/token-vault':{},
  });
  const response=await POST(new Request('https://wharf.example/api/auth/google/start',{method:'POST',body:'{}'}));
  assert.equal(response.status,409);assert.match((await response.json()).error,/sign out first/);assert.equal(writes,0);
 }
});

for(const changed of [false,true])test(`saved Google join ${changed?'rejects newer provider':'still succeeds'} before snapshot persistence`,async()=>{
 const {database,db}=await fixture();let snapshots=0;
 try{
  await database.query('INSERT INTO calendar_provider_connections VALUES($1,$2,$3)',['google-user',oldId,'old']);
  const routeDb=((strings:TemplateStringsArray,...values:unknown[])=>{
   const query=strings.join('');
   if(query.includes('SELECT * FROM google_calendar_connections'))return Promise.resolve([{refresh_token:'encrypted',version:1}]);
   if(query.includes('DELETE FROM calendar_provider_states'))return Promise.resolve([]);
   return (db as Function)(strings,...values);
  }) as CalendarDatabase;
  const calendar=loadWithMocks<{joinWithSavedCalendar:Function}>(new URL('../lib/calendar-connection.ts',import.meta.url),{
   './calendar-intent':intentMock,'./provider-connections':{},'./auth':{sql:()=>routeDb},'./meeting-participation':{persistCalendarSnapshot:async()=>{snapshots++}},
   './google':{parseBusy:()=>[],google:()=>({setCredentials:()=>{},request:async()=>{if(changed)await database.query('UPDATE calendar_provider_connections SET connection_id=$1,credential=$2',[newId,'new-outlook']);return {data:{}}}})},
   './availability':{allowed:()=>[{start:0,end:1000}]},'./token-vault':{openToken:()=> 'mock-refresh'},'./calendar-access':{needsCalendarConsent:()=>false},'./calendar-connection-store':{},
  });
  const {POST}=loadWithMocks<{POST:(r:Request)=>Promise<Response>}>(new URL('../app/api/auth/google/start/route.ts',import.meta.url),{
   '@/lib/calendar-intent':intentMock,'@/lib/provider-switch-guard':{captureGoogleSwitch,isStandaloneProviderAccount},
   '@/lib/auth':{sameOrigin:()=>true,json:(data:unknown,status=200)=>Response.json(data,{status}),meeting:async()=>({id:'meeting',constraints:'{}'}),session:async()=>({id:'session',google_sub:'google-user',name:'Person'}),sql:()=>routeDb},
   '@/lib/google':{configured:()=>true},'@/lib/google-flow':{},'@/lib/calendar-connection':calendar,'@/lib/meeting-participation':{resolveInvitation:async()=>null},'@/lib/token-vault':{tokenVaultConfigured:()=>true},
  });
  const response=await POST(new Request('https://wharf.example/api/auth/google/start',{method:'POST',body:'{"meetingId":"meeting"}'}));
  assert.equal(response.status,changed?503:200);assert.equal(snapshots,changed?0:1);
  const connections=(await database.query<{credential:string}>('SELECT credential FROM calendar_provider_connections')).rows;
  if(changed)assert.equal(connections[0].credential,'new-outlook');else assert.equal(connections.length,0);
 }finally{await database.close()}
});
