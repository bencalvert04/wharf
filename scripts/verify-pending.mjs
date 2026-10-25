import assert from 'node:assert/strict';
import {neon} from '@neondatabase/serverless';
import {createHash,randomUUID} from 'node:crypto';
const sql=neon(process.env.DATABASE_URL),base=process.env.TEST_URL||'http://127.0.0.1:3004',ids=[],sessions=[];
const c={title:'Synthetic pending check',start:'2026-10-26',end:'2026-10-26',duration:45,zone:'UTC',from:'09:00',to:'17:00',days:[1]};
const hash=s=>createHash('sha256').update(s).digest('hex');
async function create(cookie='',extra={}){const r=await fetch(base+'/api/requests',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,Cookie:cookie},body:JSON.stringify({...c,...extra})});assert.equal(r.status,201);const d=await r.json();ids.push(d.id);cookie=cookie||r.headers.get('set-cookie').split(';')[0];const sid=hash(cookie.split('=')[1]);if(!sessions.includes(sid))sessions.push(sid);return {...d,cookie,sid}}
async function list(cookie=''){const r=await fetch(base+'/api/requests',{headers:{Cookie:cookie}});assert.equal(r.status,200);return (await r.json()).meetings}
try{
const owner=await create(),outsider=await create();
assert.deepEqual(await list(),[]);assert.deepEqual((await list(owner.cookie)).map(m=>m.id),[owner.id]);
await fetch(base+'/?meeting='+owner.id,{headers:{Cookie:outsider.cookie}});assert.ok(!(await list(outsider.cookie)).some(m=>m.id===owner.id));
const sub='synthetic-'+randomUUID();await sql`UPDATE sessions SET google_sub=${sub},name='Synthetic Planner' WHERE id=${owner.sid}`;
const named=await create(owner.cookie);assert.equal((await list(owner.cookie)).find(m=>m.id===named.id).plannerName,'Synthetic Planner');
const memberSub='synthetic-'+randomUUID();await sql`UPDATE sessions SET google_sub=${memberSub} WHERE id=${outsider.sid}`;await sql`INSERT INTO attendees(meeting_id,google_sub,name,busy) VALUES(${owner.id},${memberSub},'Synthetic Attendee','[]'::jsonb)`;
const card=(await list(outsider.cookie)).find(m=>m.id===owner.id);assert.ok(card.joined);assert.equal(card.isPlanner,false);assert.deepEqual(card.attendees,[{name:'Synthetic Attendee'}]);assert.ok(!JSON.stringify(card).includes('google_sub'));assert.ok(!JSON.stringify(card).includes('planner_key'));
const demo=await create(owner.cookie,{demo:true});assert.ok(!(await list(owner.cookie)).some(m=>m.id===demo.id));
await sql`UPDATE requests SET created_at=${new Date(Date.now()-31*86400000).toISOString()} WHERE id=${named.id}`;assert.ok(!(await list(owner.cookie)).some(m=>m.id===named.id));
await fetch(base+'/api/auth/account',{method:'DELETE',headers:{Origin:base,Cookie:outsider.cookie}});assert.ok(!(await list(outsider.cookie)).some(m=>m.id===owner.id));assert.ok((await list(outsider.cookie)).some(m=>m.id===outsider.id));
console.log('Verified owner/member list permissions, invitation isolation, signed-in planner names, demo and expiry filtering, sanitized responses, and sign-out behavior.');
}finally{for(const id of ids)await sql`DELETE FROM requests WHERE id=${id}`;for(const id of sessions)await sql`DELETE FROM sessions WHERE id=${id}`}
