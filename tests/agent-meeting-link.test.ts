import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import {ZodError} from 'zod';
import {PGlite} from '@electric-sql/pglite';
import {loadWithMocks} from './module-fixture.ts';
import * as contract from '../lib/agent-contract.ts';
import * as agentView from '../lib/agent-view.ts';
import {meetingSlots} from '../lib/agent-slots.ts';
import {isSameOrigin} from '../lib/request-origin.ts';

const base='https://wharf.example';
const input={startDate:'2035-01-08',timezone:'America/Denver'};
async function fixture(){
 const database=new PGlite();
 await database.exec(`
 CREATE TABLE requests(id text PRIMARY KEY,constraints text NOT NULL,created_at text NOT NULL,planner_key text NOT NULL UNIQUE,agent_request_id text,agent_input_hash text,revision integer DEFAULT 0,final_time jsonb,owner_session text,planner_name text,UNIQUE(planner_key,agent_request_id));
 CREATE TABLE request_invitees(meeting_id text REFERENCES requests(id),id text,name text,position integer,token_hash text,google_sub text,PRIMARY KEY(meeting_id,id),UNIQUE(meeting_id,google_sub));
 CREATE TABLE attendees(meeting_id text REFERENCES requests(id),google_sub text,name text,busy jsonb,captured_at timestamptz DEFAULT now(),email text,PRIMARY KEY(meeting_id,google_sub));
 CREATE TABLE agent_calendar_authorizations(meeting_id text,participant_id text,authorized_at timestamptz,authorized_sub text);
 CREATE TABLE google_meeting_events(meeting_id text,event_id text,delivered_at timestamptz,html_link text,last_error text);
 CREATE TABLE sessions(id text,google_sub text,email text);
 CREATE TABLE slack_meetings(meeting_id text,draft jsonb);
 `);
 const sql=()=>async(strings:TemplateStringsArray,...values:unknown[])=>(await database.query(strings.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows;
 const hash=(s:string)=>crypto.createHash('sha256').update(s).digest('hex');
 const auth={sql,hash,keyMatches:(key:string,stored:string)=>stored==='sha256:'+hash(key),appUrl:()=>base,sameOrigin:(req:Request)=>isSameOrigin(req,base)};
 const api=loadWithMocks<any>(new URL('../lib/agent-api.ts',import.meta.url),{'node:crypto':crypto,zod:{ZodError},'./auth':auth,'./agent-contract':contract,'./agent-slots':{meetingSlots},'./agent-view':agentView});
 const links=loadWithMocks<any>(new URL('../lib/agent-meeting-link.ts',import.meta.url),{'node:crypto':crypto,'./agent-api':api,'./agent-contract':contract});
 const discovery=loadWithMocks<any>(new URL('../lib/agent-discovery.ts',import.meta.url),{'./agent-contract.ts':contract});
 const route=loadWithMocks<any>(new URL('../app/api/v1/meeting-links/route.ts',import.meta.url),{'@/lib/agent-api':api,'@/lib/agent-meeting-link':links,'@/lib/auth':auth,'@/lib/agent-discovery':discovery});
 const participation=loadWithMocks<any>(new URL('../lib/meeting-participation.ts',import.meta.url),{'./schedule-meeting-refresh':{scheduleMeetingRefresh:()=>{}},'./auth':auth,'./pending-meeting-store':{}});
 const post=(key:string|null,body:unknown=input,headers:Record<string,string>={})=>route.POST(new Request(base+'/api/v1/meeting-links',{method:'POST',headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{}),...headers},body:typeof body==='string'?body:JSON.stringify(body)})) as Promise<Response>;
 return {database,post,route,participation};
}

test('shared-link route handles lost responses and concurrent retries, then hands planning to the first human',async()=>{
 const f=await fixture();try{
  const key=crypto.randomUUID();
  const first=await f.post(key);assert.equal(first.status,201);assert.equal(first.headers.get('Cache-Control'),'no-store');
  const created=await first.json();assert.equal(created.status,'awaiting_responses');assert.equal(created.replayed,false);
  assert.equal(new URL(created.invitationUrl).searchParams.get('meeting'),created.id);
  assert.ok(created.shareMessage.includes(created.invitationUrl));assert.equal(created.nextAction.type,'share_link');
  const retries=await Promise.all([f.post(key),f.post(key)]);
  for(const retry of retries){assert.equal(retry.status,201);const body=await retry.json();assert.equal(body.id,created.id);assert.equal(body.replayed,true)}
  const changed=await f.post(key,{...input,durationMinutes:45});assert.equal(changed.status,409);assert.equal((await changed.json()).error.code,'idempotency_conflict');
  assert.equal((await f.database.query('SELECT * FROM requests')).rows.length,1);
  assert.equal((await f.database.query('SELECT * FROM google_meeting_events')).rows.length,0);
  assert.equal(await f.participation.resolveInvitation(created.id,null),null);
  await f.participation.persistCalendarSnapshot(created.id,'human-one','First human',[],'first-session');
  await f.participation.persistCalendarSnapshot(created.id,'human-two','Second human',[],'second-session');
  const stored=(await f.database.query<any>('SELECT * FROM requests')).rows[0];
  assert.equal(stored.owner_session,'first-session');assert.equal(JSON.parse(stored.constraints).openJoin,true);
  const replay=await (await f.post(key)).json();assert.equal(replay.status,'ready');
  for(const secret of [key,stored.planner_key,'human-one','human-two','First human','Second human'])assert.ok(!JSON.stringify(replay).includes(secret));
  assert.equal(replay.participants,undefined);assert.equal(replay.plannerKey,undefined);
  await f.database.query("UPDATE requests SET final_time=$1::jsonb WHERE id=$2",[JSON.stringify({start:'2035-01-08T16:00:00Z'}),created.id]);
  const finalized=await (await f.post(key)).json();assert.equal(finalized.nextAction.type,'view_meeting');assert.ok(!finalized.shareMessage.includes('share your availability'));
  await f.database.query("UPDATE requests SET created_at=$1 WHERE id=$2",[new Date(Date.now()-31*86400000).toISOString(),created.id]);
  assert.equal((await f.post(key)).status,410);
 }finally{await f.database.close()}
});

test('shared-link route rejects invalid input before writing and keeps validation actionable',async()=>{
 const f=await fixture();try{
  for(const key of [null,'team-meeting','00000000-0000-0000-0000-000000000000']){
   const response=await f.post(key);assert.equal(response.status,400);const body=await response.json();assert.equal(body.error.code,'idempotency_key_required');assert.ok(body.error.nextAction.includes('UUID'));
  }
  for(const patch of [{timezone:undefined},{timezone:'Not/AZone'},{startDate:'2035-02-30'},{endDate:'2035-02-10'},{participants:[]},{openJoin:false},{dayStart:'18:00'},{unknown:'field'}]){
   const response=await f.post(crypto.randomUUID(),{...input,...patch});assert.equal(response.status,400);assert.equal((await response.json()).error.code,'invalid_input');
  }
  assert.equal((await f.post(crypto.randomUUID(),input,{Origin:'https://unrelated.example'})).status,403);
  assert.equal((await f.post(crypto.randomUUID(),'not JSON')).status,400);
  assert.equal((await f.post(crypto.randomUUID(),'x'.repeat(32769))).status,413);
  assert.equal((await f.database.query('SELECT * FROM requests')).rows.length,0);
  const response=await f.post(crypto.randomBytes(32).toString('base64url'),{...input,title:'Team sync',durationMinutes:45,endDate:'2035-01-09'});
  assert.equal(response.status,201);assert.ok((await response.json()).shareMessage.includes('45-minute'));
 }finally{await f.database.close()}
});

test('discovery and OpenAPI agree on the executable minimal request and response contract',()=>{
 const {discovery,agentGuide}=loadWithMocks<any>(new URL('../lib/agent-discovery.ts',import.meta.url),{'./agent-contract.ts':contract});
 const {agentOpenApi}=loadWithMocks<any>(new URL('../lib/agent-openapi.ts',import.meta.url),{'./agent-contract.ts':contract});
 const quick=discovery(base).quickstart,spec=agentOpenApi(base),operation=spec.paths['/api/v1/meeting-links'].post;
 assert.deepEqual(quick.requiredFields,['startDate','timezone']);assert.equal(quick.authentication,'none');
 assert.equal(contract.createMeetingLinkSchema.safeParse(quick.example).success,true);
 assert.deepEqual(operation.security,[]);assert.deepEqual(operation.requestBody.content['application/json'].example,quick.example);
 assert.deepEqual(spec.components.schemas.CreateMeetingLink.required,['startDate','timezone']);
 assert.equal(spec.components.schemas.CreateMeetingLink.additionalProperties,false);
 for(const field of quick.responseFields)assert.ok(spec.components.schemas.MeetingLink.properties[field]);
 assert.ok(agentGuide(base).indexOf('/api/v1/meeting-links')<agentGuide(base).indexOf('## Advanced'));
 assert.ok(discovery(base).tools.find((t:any)=>t.name==='wharf_create_meeting').description.includes('openJoin:true'));
});
