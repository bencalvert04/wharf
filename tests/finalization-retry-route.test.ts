import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {loadWithMocks} from './module-fixture.ts';
import {freezeEmailMeeting} from '../lib/email-finalization-store.ts';
import {deliverInvitationJobs} from '../lib/invitation-delivery.ts';
import {availabilityRevision,validFinalSlot} from '../lib/finalization.ts';
import {validEmail} from '../lib/calendar-invitation.ts';
import type {CalendarDatabase} from '../lib/calendar-connection-store.ts';

async function fixture(ambiguous=false){
 const database=new PGlite();
 await database.exec(`CREATE TABLE requests(id text PRIMARY KEY,final_time jsonb,revision integer DEFAULT 0);CREATE TABLE attendees(meeting_id text,google_sub text,name text,email text,busy jsonb);CREATE TABLE google_meeting_events(meeting_id text PRIMARY KEY);CREATE TABLE invitation_outbox(id text PRIMARY KEY,meeting_id text REFERENCES requests(id),recipient_key text,payload jsonb NOT NULL,UNIQUE(meeting_id,recipient_key),created_at timestamptz DEFAULT now(),lease_until timestamptz,first_attempt_at timestamptz,attempts integer DEFAULT 0,sent_at timestamptz,provider_id text,last_error text);INSERT INTO requests(id) VALUES('meeting');`);
 const people=[{google_sub:'microsoft:test',name:'Planner',email:'planner@example.test',busy:[]},{google_sub:'google:test',name:'Guest',email:'guest@example.test',busy:[]}];
 for(const p of people)await database.query('INSERT INTO attendees VALUES($1,$2,$3,$4,$5)',['meeting',p.google_sub,p.name,p.email,JSON.stringify(p.busy)]);
 const tag=(strings:TemplateStringsArray,...values:unknown[])=>{
  const query=strings.reduce((out,part,index)=>out+(index?'$'+index:'')+part,'');
  return {query,values,then:(resolve:any,reject:any)=>database.query(query,values).then(r=>r.rows).then(resolve,reject)};
 };
 const db=Object.assign(tag,{transaction:(queries:{query:string;values:unknown[]}[])=>database.transaction(async tx=>{
  const rows=[];for(const q of queries)rows.push((await tx.query(q.query,q.values)).rows);return rows;
 })}) as unknown as CalendarDatabase;
 const constraints={title:'Retry test',start:'2035-01-02',end:'2035-01-02',duration:30,zone:'UTC',from:'09:00',to:'17:00',days:[0,1,2,3,4,5,6]};
 let sends=0;
 const send=async()=>{sends++;if(ambiguous)throw Error('Accepted, but SMTP response lost');return 'smtp-id'};
 const {POST}=loadWithMocks<{POST:Function}>(new URL('../app/api/requests/[id]/finalize/route.ts',import.meta.url),{
  '@/lib/meeting-refresh':{refreshMeetingAvailability:async()=>{},AvailabilityRefreshError:class extends Error{}},
  '@/lib/provider-connections':{providerConnection:async()=>({credential:'synthetic'})},
  '@/lib/commit-finalization':{commitFinalization:(id:string,_c:unknown,participants:any[],start:number,end:number)=>freezeEmailMeeting(db,id,participants,start,end,participants.map(p=>({email:p.email,payload:{to:p.email}})))},
  '@/lib/invitations':{invitationsConfigured:()=>true,deliverInvitations:(id:string)=>deliverInvitationJobs(db,send,id)},
  '@/lib/planner-access':{plannerAccess:async()=>({allowed:true})},
  '@/lib/slack-web-booking':{},'@/lib/agent-api':{AgentError:class extends Error{}},
  '@/lib/auth':{sameOrigin:()=>true,session:async()=>({id:'session',google_sub:'microsoft:test',email:'planner@example.test'}),sql:()=>db,meeting:async()=>({...((await database.query<{id:string;final_time:unknown;revision:number}>('SELECT * FROM requests')).rows[0]),constraints:JSON.stringify(constraints)}),json:(body:unknown,status=200)=>Response.json(body,{status})},
  '@/lib/finalization':{availabilityRevision,validFinalSlot},
  '@/lib/calendar-invitation':{validEmail},
  '@/lib/google-meeting-events':{googleMeetingEvent:async()=>null,CalendarPermissionRequired:class extends Error{}},
 });
 const request=()=>POST(new Request('https://staging.example/api/requests/meeting/finalize',{method:'POST',body:JSON.stringify({start:Date.parse('2035-01-02T10:00Z'),end:Date.parse('2035-01-02T10:30Z'),revision:availabilityRevision(people)})}),{params:Promise.resolve({id:'meeting'})}) as Promise<Response>;
 return {database,request,sends:()=>sends};
}
test('actual finalization handler recovers a discarded response and concurrent repeated confirmations without duplicate mail',async()=>{
 const f=await fixture();try{
  assert.equal((await f.request()).status,200); // Treat the first response as lost by the client.
  const retries=await Promise.all([f.request(),f.request()]);
  assert.ok(retries.every(r=>r.status===200));assert.equal(f.sends(),2);
  assert.equal((await f.database.query('SELECT * FROM invitation_outbox')).rows.length,2);
  assert.equal((await f.database.query<{revision:number}>('SELECT revision FROM requests')).rows[0].revision,1);
 }finally{await f.database.close()}
});
test('finalization retries keep ambiguous SMTP delivery pending for review even after lease expiry',async()=>{
 const f=await fixture(true);try{
  for(let i=0;i<2;i++){
   const response=await f.request();assert.equal(response.status,202);
   const body=await response.json();assert.equal(body.delivery.needsReview,2);
   await f.database.exec("UPDATE invitation_outbox SET lease_until=now()-interval '1 hour'");
  }
  assert.equal(f.sends(),2);
 }finally{await f.database.close()}
});
