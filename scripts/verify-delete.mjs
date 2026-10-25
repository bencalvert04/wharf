import assert from 'node:assert/strict';
import {neon} from '@neondatabase/serverless';
import {createHash,randomUUID} from 'node:crypto';
const sql=neon(process.env.DATABASE_URL),base=process.env.TEST_URL||'http://127.0.0.1:3004',ids=[],sessions=[];
const c={title:'Synthetic delete check',start:'2026-10-26',end:'2026-10-26',duration:30,zone:'UTC',from:'09:00',to:'17:00',days:[1]};
async function create(){const r=await fetch(base+'/api/requests',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(c)});assert.equal(r.status,201);const d=await r.json(),cookie=r.headers.get('set-cookie').split(';')[0],sid=createHash('sha256').update(cookie.split('=')[1]).digest('hex');ids.push(d.id);sessions.push(sid);return {...d,cookie,sid}}
const remove=(id,headers={})=>fetch(base+'/api/requests/'+id,{method:'DELETE',headers:{Origin:base,...headers}});
try{
 const owner=await create(),other=await create();
 const sub='synthetic-'+randomUUID();
 await sql`UPDATE sessions SET google_sub=${sub} WHERE id=${other.sid}`;
 await sql`INSERT INTO attendees(meeting_id,google_sub,name,busy) VALUES(${owner.id},${sub},'Synthetic attendee','[]'::jsonb)`;
 assert.equal((await remove(owner.id)).status,403);
 assert.equal((await remove(owner.id,{Cookie:other.cookie})).status,403);
 assert.equal((await remove(owner.id,{Authorization:'Bearer wrong'})).status,403);
 assert.equal((await remove(owner.id,{Cookie:owner.cookie,Origin:'https://untrusted.example'})).status,403);
 assert.equal((await remove(owner.id,{Cookie:owner.cookie})).status,200);
 assert.equal((await fetch(base+'/api/requests/'+owner.id)).status,404);
 assert.equal((await sql`SELECT * FROM attendees WHERE meeting_id=${owner.id}`).length,0);
 assert.equal((await remove(owner.id,{Cookie:owner.cookie})).status,404);
 assert.equal((await remove(other.id,{Authorization:'Bearer '+other.plannerKey})).status,200);
 console.log('Verified planner deletion, attendee/anonymous/invalid-key/origin denial, cascade cleanup, missing meetings, and planner-key access.');
}finally{for(const id of ids)await sql`DELETE FROM requests WHERE id=${id}`;for(const id of sessions)await sql`DELETE FROM sessions WHERE id=${id}`}
