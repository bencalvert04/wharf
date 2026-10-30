import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {calendarProviderSchema} from '../db/calendar-provider-schema.mjs';
import {storeProviderGrant} from '../lib/provider-connection-store.ts';
import type {CalendarDatabase} from '../lib/calendar-connection-store.ts';
async function fixture(){
 const database=new PGlite();
 await database.exec(`CREATE TABLE sessions(id text PRIMARY KEY,google_sub text,name text,email text,picture text,expires_at timestamptz NOT NULL);CREATE TABLE requests(id text PRIMARY KEY);INSERT INTO sessions VALUES('session',NULL,NULL,NULL,NULL,now()+interval '1 day');`);
 for(const statement of calendarProviderSchema)await database.exec(statement);
 const db=(async(strings:TemplateStringsArray,...values:unknown[])=>{const query=strings.reduce((out,part,index)=>out+(index?'$'+index:'')+part,'');return (await database.query(query,values)).rows;}) as unknown as CalendarDatabase;
 return {db,database};
}
test('standalone non-Google login stores encrypted credentials and associates the session atomically',async()=>{
 const {db,database}=await fixture();try{
  await storeProviderGrant(db,{id:'session'},'microsoft:123','microsoft','encrypted','person@example.test','Person',null);
  const [account]=(await database.query('SELECT google_sub,name,email FROM sessions')).rows;
  assert.deepEqual(account,{google_sub:'microsoft:123',name:'Person',email:'person@example.test'});
  assert.equal((await database.query<{credential:string}>('SELECT credential FROM calendar_provider_connections')).rows[0].credential,'encrypted');
  for(const statement of calendarProviderSchema)await database.exec(statement);
 }finally{await database.close()}
});
test('connecting another provider retains an existing Wharf identity and rejects a stale generation',async()=>{
 const {db,database}=await fixture();try{
  await database.exec("UPDATE sessions SET google_sub='google-person';INSERT INTO calendar_provider_connections(account_id,provider) VALUES('google-person','icloud')");
  const generation=(await database.query<{connection_id:string}>('SELECT connection_id FROM calendar_provider_connections')).rows[0].connection_id;
  const s={id:'session',google_sub:'google-person'};
  await storeProviderGrant(db,s,'google-person','icloud','first','person@example.test','Person',generation);
  assert.equal((await database.query<{google_sub:string}>('SELECT google_sub FROM sessions')).rows[0].google_sub,'google-person');
  await assert.rejects(storeProviderGrant(db,s,'google-person','microsoft','stale','person@example.test','Person',generation),/changed/);
  assert.equal((await database.query<{credential:string}>('SELECT credential FROM calendar_provider_connections')).rows[0].credential,'first');
 }finally{await database.close()}
});
test('disconnect and account switching invalidate in-flight connections without recreating credentials',async()=>{
 const {db,database}=await fixture();try{
  await database.exec("UPDATE sessions SET google_sub='person';INSERT INTO calendar_provider_connections(account_id,provider) VALUES('person','icloud')");
  const generation=(await database.query<{connection_id:string}>('SELECT connection_id FROM calendar_provider_connections')).rows[0].connection_id;
  await database.exec('DELETE FROM calendar_provider_connections');
  await assert.rejects(storeProviderGrant(db,{id:'session',google_sub:'person'},'person','icloud','stale','person@example.test','Person',generation),/changed/);
  assert.equal((await database.query('SELECT * FROM calendar_provider_connections')).rows.length,0);
  await database.exec("UPDATE sessions SET google_sub='different'");
  await assert.rejects(storeProviderGrant(db,{id:'session'},'microsoft:123','microsoft','stale','person@example.test','Person',null),/changed/);
  assert.equal((await database.query('SELECT * FROM calendar_provider_connections')).rows.length,0);
 }finally{await database.close()}
});
