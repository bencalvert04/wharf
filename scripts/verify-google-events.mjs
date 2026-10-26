import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {commitGoogleFinalization} from '../lib/google-meeting-events.ts';
const sql=neon(process.env.DATABASE_URL),base=process.env.TEST_URL||'http://127.0.0.1:3019';
const ids=[],sessions=[],subs=[];
const date=new Date(Date.now()+86400000).toISOString().slice(0,10),start=Date.parse(date+'T10:00Z'),end=start+1800000;
const constraints={title:'Synthetic Google Calendar check',start:date,end:date,duration:30,zone:'UTC',from:'09:00',to:'17:00',days:[0,1,2,3,4,5,6]};
const post=(path,body,cookie='',origin=base)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify(body)});
async function create(){
 const response=await post('/api/requests',constraints);assert.equal(response.status,201);const data=await response.json();ids.push(data.id);
 const cookie=response.headers.get('set-cookie').split(';')[0],sid=createHash('sha256').update(cookie.split('=')[1]).digest('hex'),sub='synthetic-google-'+randomUUID();sessions.push(sid);subs.push(sub);
 await sql`UPDATE sessions SET google_sub=${sub},name='Synthetic planner',email='planner@example.com' WHERE id=${sid}`;
 const people=[{google_sub:sub,name:'Synthetic planner',email:'planner@example.com',busy:[]},{google_sub:'synthetic-guest-'+randomUUID(),name:'Synthetic guest',email:'guest@example.com',busy:[]}];
 for(const person of people)await sql`INSERT INTO attendees(meeting_id,google_sub,name,email,busy) VALUES(${data.id},${person.google_sub},${person.name},${person.email},'[]'::jsonb)`;
 return {...data,cookie,sid,sub,people};
}
async function detail(owner,cookie=owner.cookie){const response=await fetch(base+'/api/requests/'+owner.id,{headers:{Cookie:cookie}});assert.equal(response.status,200);return response.json()}
try{
 const owner=await create(),outsider=await create();
 const data=await detail(owner),body={start,end,revision:data.revision};
 assert.equal((await post('/api/requests/'+owner.id+'/finalize',body,outsider.cookie)).status,403);
 assert.equal((await post('/api/auth/google/events',{meetingId:owner.id},outsider.cookie)).status,403);
 assert.equal((await post('/api/auth/google/events',{meetingId:owner.id},owner.cookie,'https://untrusted.example')).status,403);
 const denied=await post('/api/requests/'+owner.id+'/finalize',body,owner.cookie);assert.equal(denied.status,409);assert.equal((await denied.json()).code,'GOOGLE_CALENDAR_PERMISSION_REQUIRED');
 assert.equal((await detail(owner)).finalTime,null);assert.equal((await sql`SELECT * FROM google_meeting_events WHERE meeting_id=${owner.id}`).length,0);
 const consent=await post('/api/auth/google/events',{meetingId:owner.id},owner.cookie);assert.equal(consent.status,200);
 const url=new URL((await consent.json()).url);assert.equal(url.hostname,'accounts.google.com');assert.ok(url.searchParams.get('scope').includes('calendar.events.owned'));assert.ok(url.searchParams.get('scope').includes('calendar.freebusy'));assert.equal(url.searchParams.get('access_type'),'offline');
 const [flow]=await sql`SELECT purpose,expected_sub,meeting_id,return_meeting_id FROM oauth_states WHERE session_id=${owner.sid}`;assert.equal(flow.purpose,'events');assert.equal(flow.expected_sub,owner.sub);assert.equal(flow.meeting_id,null);assert.equal(flow.return_meeting_id,owner.id);
 const commits=await Promise.all([1,2].map(()=>commitGoogleFinalization(owner.id,constraints,owner.people,start,end,owner.sub,'planner@example.com')));assert.ok(commits.every(Boolean));
 const jobs=await sql`SELECT * FROM google_meeting_events WHERE meeting_id=${owner.id}`;assert.equal(jobs.length,1);assert.equal(jobs[0].payload.attendees.length,1);assert.equal(jobs[0].payload.attendees[0].email,'guest@example.com');
 assert.equal((await sql`SELECT * FROM invitation_outbox WHERE meeting_id=${owner.id}`).length,0);
 assert.equal(await commitGoogleFinalization(owner.id,constraints,owner.people,start+3600000,end+3600000,owner.sub,'planner@example.com'),false);
 assert.equal((await detail(owner)).calendar.status,'pending');assert.equal((await detail(owner,outsider.cookie)).calendar,null);
 const retry=await post('/api/requests/'+owner.id+'/invitations',{},owner.cookie);assert.equal(retry.status,409);assert.equal((await retry.json()).code,'GOOGLE_CALENDAR_PERMISSION_REQUIRED');
 await sql`UPDATE attendees SET name='Changed snapshot' WHERE meeting_id=${outsider.id} AND google_sub=${outsider.sub}`;
 assert.equal(await commitGoogleFinalization(outsider.id,constraints,outsider.people,start,end,outsider.sub,'planner@example.com'),false);
 assert.equal((await detail(outsider)).finalTime,null);
 console.log('Verified planner-only consent, origin checks, missing-scope rejection without finalizing, atomic event jobs, concurrent retries, snapshot conflicts, no duplicate SMTP jobs, and pending recovery. No provider events were created.');
}finally{
 for(const sid of sessions)await sql`DELETE FROM oauth_states WHERE session_id=${sid}`;
 for(const id of ids)await sql`DELETE FROM requests WHERE id=${id}`;
 for(const sid of sessions)await sql`DELETE FROM sessions WHERE id=${sid}`;
 for(const sub of subs)await sql`DELETE FROM google_calendar_connections WHERE google_sub=${sub}`;
}
