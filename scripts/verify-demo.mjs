import assert from 'node:assert/strict';
import {neon} from '@neondatabase/serverless';
import {createHash} from 'node:crypto';
const sql=neon(process.env.DATABASE_URL),base=process.env.TEST_URL||'http://127.0.0.1:3004';
const r=await fetch(base+'/api/requests',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({title:'test',demo:true,sampleCount:4,start:'2026-10-26',end:'2026-10-26',duration:45,zone:'UTC',from:'09:00',to:'17:00',days:[1]})});assert.equal(r.status,201);const d=await r.json(),cookie=r.headers.get('set-cookie').split(';')[0];
try{const read=()=>fetch(base+'/api/requests/'+d.id,{headers:{Cookie:cookie}}).then(r=>r.json());let data=await read();assert.equal(data.attendees.length,4);assert.ok(data.attendees.every(p=>p.sample));assert.ok(data.windows.length);assert.equal((await fetch(base+'/api/requests/'+d.id)).status,403);
await sql`INSERT INTO attendees(meeting_id,google_sub,name,busy) VALUES(${d.id},'demo-test','Synthetic user',${JSON.stringify([{start:Date.parse('2026-10-26T00:00Z'),end:Date.parse('2026-10-27T00:00Z')}])}::jsonb)`;
data=await read();assert.equal(data.attendees.length,5);assert.deepEqual(data.windows,[]);assert.ok(data.attendees.every(p=>!('busy' in p)));console.log('Verified personal demo isolation, four sample calendars, real snapshot intersection, and no raw busy data in responses.');
}finally{await sql`DELETE FROM requests WHERE id=${d.id}`;const hash=createHash('sha256').update(cookie.split('=')[1]).digest('hex');await sql`DELETE FROM sessions WHERE id=${hash}`}
