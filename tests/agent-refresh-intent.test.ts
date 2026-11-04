import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {calendarIntentSchema} from '../db/calendar-intent-schema.mjs';
import {captureAccountIntent,runCalendarIntent,guardCalendarDatabase} from '../lib/calendar-intent.ts';
import type {CalendarDatabase} from '../lib/calendar-connection-store.ts';
import {loadWithMocks} from './module-fixture.ts';

class AgentError extends Error{code:string;constructor(code:string,message:string){super(message);this.code=code}}
async function fixture(){
 const database=new PGlite();let inTransaction=false;
 await database.exec(`CREATE TABLE sessions(id text PRIMARY KEY,google_sub text,expires_at timestamptz);CREATE TABLE oauth_states(id text);CREATE TABLE calendar_provider_states(id text);CREATE TABLE requests(id text PRIMARY KEY,revision integer,final_time jsonb);CREATE TABLE attendees(meeting_id text,google_sub text,busy jsonb,captured_at timestamptz);INSERT INTO requests VALUES('meeting',1,NULL);INSERT INTO attendees VALUES('meeting','icloud:first','[{"start":1,"end":2}]','2026-01-01'),('meeting','google-second','[{"start":3,"end":4}]','2026-01-01');INSERT INTO sessions VALUES('other-session','icloud:first',now()+interval '1 day');`);
 for(const statement of calendarIntentSchema)await database.exec(statement);
 const tag=(strings:TemplateStringsArray,...values:unknown[])=>{
  const query=strings.reduce((out,part,index)=>out+(index?'$'+index:'')+part,'');
  return {query,values,then:(resolve:any,reject:any)=>database.query(query,values).then(r=>r.rows).then(resolve,reject)};
 };
 const db=Object.assign(tag,{transaction:(queries:{query:string;values:unknown[]}[])=>database.transaction(async tx=>{
  inTransaction=true;try{const result=[];for(const query of queries)result.push((await tx.query(query.query,query.values)).rows);return result}finally{inTransaction=false}
 })}) as unknown as CalendarDatabase;
 return {database,db,assertOutsideTransaction:()=>assert.equal(inTransaction,false,'provider network work must be outside DB transactions')};
}

for(const staleAccount of [null,'icloud:first','google-second'])test(`mixed-provider refresh ${staleAccount?'rejects changed '+staleAccount+' after fetch without updating any participant':'commits every participant when intents remain current'}`,async()=>{
 const stale=staleAccount!==null;
 const {database,db,assertOutsideTransaction}=await fixture();let providerReads=0,googleReads=0;
 try{
  const {refreshAgentAvailability}=loadWithMocks<{refreshAgentAvailability:(id:string,key:string)=>Promise<void>}>(new URL('../lib/agent-refresh.ts',import.meta.url),{
   './calendar-intent':{captureAccountIntent,runCalendarIntent},
   './provider-connections':{providerConnection:async(account:string)=>account==='icloud:first'?{credential:'mock'}:null,readProviderAvailability:async()=>{
    assertOutsideTransaction();providerReads++;
    const fetched=[{start:10,end:20}];
    // A different browser disconnects/reconnects this account after its fetch.
    if(stale){
     await database.query("UPDATE sessions SET google_sub=$1 WHERE id='other-session'",[staleAccount]);
     await database.query("SELECT wharf_begin_calendar_intent('other-session',$1,true,true)",[staleAccount]);
    }
    return fetched;
   }},
   './auth':{sql:()=>guardCalendarDatabase(db)},
   './agent-api':{AgentError,loadAgentMeeting:async()=>({constraints:'{}',revision:1,people:[{googleSub:'icloud:first',name:'First'},{googleSub:'google-second',name:'Second'}]})},
   './calendar-connection':{calendarConnection:async()=>({refresh_token:'encrypted'})},
   './google':{parseBusy:()=>[{start:30,end:40}],google:()=>({setCredentials:()=>{},request:async()=>{assertOutsideTransaction();googleReads++;return {data:{}}}})},
   './token-vault':{openToken:()=> 'mock-token'},'./availability':{allowed:()=>[{start:0,end:100}]},
  });
  const operation=refreshAgentAvailability('meeting','mock-key');
  if(stale)await assert.rejects(operation,(error:unknown)=>error instanceof AgentError&&error.code==='availability_refresh_failed');else await operation;
  assert.equal(providerReads,1);assert.equal(googleReads,1);
  const rows=(await database.query<{google_sub:string;busy:unknown}>('SELECT google_sub,busy FROM attendees ORDER BY google_sub')).rows;
  assert.deepEqual(rows,[{google_sub:'google-second',busy:stale?[{start:3,end:4}]:[{start:30,end:40}]},{google_sub:'icloud:first',busy:stale?[{start:1,end:2}]:[{start:10,end:20}]}]);
  assert.equal((await database.query<{revision:number}>('SELECT revision FROM requests')).rows[0].revision,stale?1:2);
 }finally{await database.close()}
});

test('merging refresh captures preserves the earliest expiry and cannot renew an expired read',async()=>{
 const {database,db}=await fixture();const expired='2000-01-01T00:00:00.000Z';let combinedDeadline='';
 try{
  const {refreshAgentAvailability}=loadWithMocks<{refreshAgentAvailability:(id:string,key:string)=>Promise<void>}>(new URL('../lib/agent-refresh.ts',import.meta.url),{
   './calendar-intent':{
    captureAccountIntent:async(raw:CalendarDatabase,account:string)=>{
     const intent=await captureAccountIntent(raw,account);
     // Model an earlier read that expired while the rest of the batch loaded.
     return account==='icloud:first'?{...intent,expiresAt:expired}:intent;
    },
    runCalendarIntent:async(intent:Parameters<typeof runCalendarIntent>[0],work:()=>Promise<void>)=>{combinedDeadline=intent.expiresAt;return runCalendarIntent(intent,work)},
   },
   './provider-connections':{providerConnection:async()=>({credential:'mock'}),readProviderAvailability:async()=>[{start:10,end:20}]},
   './auth':{sql:()=>guardCalendarDatabase(db)},
   './agent-api':{AgentError,loadAgentMeeting:async()=>({constraints:'{}',revision:1,people:[{googleSub:'icloud:first',name:'First'},{googleSub:'google-second',name:'Second'}]})},
   './calendar-connection':{},'./google':{},'./token-vault':{},'./availability':{allowed:()=>[{start:0,end:100}]},
  });
  await assert.rejects(refreshAgentAvailability('meeting','mock-key'),(error:unknown)=>error instanceof AgentError&&error.code==='availability_refresh_failed');
  assert.equal(combinedDeadline,expired);
  assert.equal((await database.query<{revision:number}>('SELECT revision FROM requests')).rows[0].revision,1);
  assert.deepEqual((await database.query<{busy:unknown}>('SELECT busy FROM attendees ORDER BY google_sub')).rows,[{busy:[{start:3,end:4}]},{busy:[{start:1,end:2}]}]);
 }finally{await database.close()}
});
