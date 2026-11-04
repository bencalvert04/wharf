import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {freezeEmailMeeting} from '../lib/email-finalization-store.ts';
import type {CalendarDatabase} from '../lib/calendar-connection-store.ts';
const people=[{google_sub:'icloud:1',name:'Apple user',email:'apple@example.test',busy:[]},{google_sub:'microsoft:2',name:'Outlook user',email:'outlook@example.test',busy:[]}];
async function fixture(){
 const database=new PGlite();
 await database.exec(`CREATE TABLE requests(id text PRIMARY KEY,final_time jsonb,revision integer DEFAULT 0);CREATE TABLE attendees(meeting_id text,google_sub text,name text,email text,busy jsonb);CREATE TABLE google_meeting_events(meeting_id text PRIMARY KEY);CREATE TABLE invitation_outbox(id text PRIMARY KEY,meeting_id text REFERENCES requests(id),recipient_key text,payload jsonb NOT NULL,UNIQUE(meeting_id,recipient_key));INSERT INTO requests(id) VALUES('meeting');`);
 for(const p of people)await database.query('INSERT INTO attendees VALUES($1,$2,$3,$4,$5)',['meeting',p.google_sub,p.name,p.email,JSON.stringify(p.busy)]);
 const tag=(strings:TemplateStringsArray,...values:unknown[])=>{
  const query=strings.reduce((out,part,index)=>out+(index?'$'+index:'')+part,'');
  return {query,values,then:(resolve:any,reject:any)=>database.query(query,values).then(r=>r.rows).then(resolve,reject)};
 };
 const db=Object.assign(tag,{transaction:(queries:{query:string;values:unknown[]}[])=>database.transaction(async tx=>{
  const result=[];for(const query of queries)result.push((await tx.query(query.query,query.values)).rows);return result;
 })}) as unknown as CalendarDatabase;
 return {database,db};
}
const recipients=people.map(p=>({email:p.email,payload:{to:p.email}}));
test('mixed-provider meeting time and invitations commit together; repeated finalization does not duplicate mail',async()=>{
 const {database,db}=await fixture();try{
  assert.equal(await freezeEmailMeeting(db,'meeting',people,1000,2000,recipients),true);
  assert.deepEqual((await database.query('SELECT final_time,revision FROM requests')).rows,[{final_time:{start:1000,end:2000},revision:1}]);
  assert.equal((await database.query('SELECT * FROM invitation_outbox')).rows.length,2);
  assert.equal(await freezeEmailMeeting(db,'meeting',people,1000,2000,recipients),false);
  assert.equal((await database.query('SELECT * FROM invitation_outbox')).rows.length,2);
 }finally{await database.close()}
});
test('changed availability or a native Google event prevents email finalization and outbox jobs',async()=>{
 const {database,db}=await fixture();try{
  await database.exec("UPDATE attendees SET busy='[{\"start\":1100,\"end\":1200}]' WHERE google_sub='icloud:1'");
  assert.equal(await freezeEmailMeeting(db,'meeting',people,1000,2000,recipients),false);
  assert.equal((await database.query('SELECT * FROM invitation_outbox')).rows.length,0);
  assert.equal((await database.query<{final_time:null}>('SELECT final_time FROM requests')).rows[0].final_time,null);
  await database.exec("UPDATE attendees SET busy='[]';INSERT INTO google_meeting_events VALUES('meeting');UPDATE requests SET final_time='{\"start\":1000,\"end\":2000}'");
  assert.equal(await freezeEmailMeeting(db,'meeting',people,1000,2000,recipients),false);
  assert.equal((await database.query('SELECT * FROM invitation_outbox')).rows.length,0);
 }finally{await database.close()}
});
test('an invitation queue failure rolls back the saved meeting time',async()=>{
 const {database,db}=await fixture();try{
  await assert.rejects(freezeEmailMeeting(db,'meeting',people,1000,2000,[{email:'person@example.test',payload:undefined}]));
  assert.equal((await database.query<{final_time:null}>('SELECT final_time FROM requests')).rows[0].final_time,null);
  assert.equal((await database.query('SELECT * FROM invitation_outbox')).rows.length,0);
 }finally{await database.close()}
});
