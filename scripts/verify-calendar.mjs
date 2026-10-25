import assert from 'node:assert/strict';
import {neon} from '@neondatabase/serverless';
import {randomBytes,createHash} from 'node:crypto';
const sql=neon(process.env.DATABASE_URL);const base='http://127.0.0.1:3002';
const c={title:'Calendar integration verification',start:'2026-10-26',end:'2026-10-26',duration:30,zone:'UTC',from:'09:00',to:'17:00',days:[1]};
const create=await fetch(base+'/api/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)});assert.equal(create.status,201);const ownerCookie=create.headers.get('set-cookie').split(';')[0];const d=await create.json();const hash=s=>createHash('sha256').update(s).digest('hex');const memberToken=randomBytes(32).toString('base64url');const memberId=hash(memberToken);
try{
 await sql`INSERT INTO attendees(meeting_id,google_sub,name,busy) VALUES(${d.id},'test-sub','Synthetic attendee','[{"start":1793005200000,"end":1793008800000}]'::jsonb)`;
 await sql`INSERT INTO sessions(id,google_sub,expires_at) VALUES(${memberId},'test-sub',now()+interval '10 minutes')`;
 const read=async headers=>(await fetch(base+'/api/requests/'+d.id,{headers})).json();
 const anonymous=await read({});assert.equal(anonymous.canView,false);assert.deepEqual(anonymous.attendees,[]);assert.deepEqual(anonymous.windows,[]);
 for(const headers of [{Cookie:ownerCookie},{Authorization:'Bearer '+d.plannerKey},{Cookie:'wharf_session='+memberToken}]){const r=await read(headers);assert.equal(r.canView,true);assert.equal(r.attendees.length,1);assert.equal('busy' in r.attendees[0],false);assert.ok(r.windows.length)}
 assert.equal((await read({Authorization:'Bearer wrong'})).canView,false);
 assert.equal((await fetch(base+'/api/requests/'+d.id+'/leave',{method:'POST',headers:{Origin:'https://evil.example',Cookie:'wharf_session='+memberToken}})).status,403);
 assert.equal((await fetch(base+'/api/requests/'+d.id+'/leave',{method:'POST'})).status,401);
 assert.equal((await fetch(base+'/api/requests/'+d.id+'/leave',{method:'POST',headers:{Cookie:'wharf_session='+memberToken}})).status,200);
 assert.equal((await read({Cookie:'wharf_session='+memberToken})).canView,false);
 const state='synthetic-state';await sql`INSERT INTO oauth_states VALUES(${hash(state)},${memberId},${d.id},'verifier','nonce',now()+interval '10 minutes')`;
 const cb=base+'/api/auth/google/callback?state='+state+'&error=access_denied';
 await fetch(cb,{redirect:'manual'});assert.equal((await sql`SELECT id FROM oauth_states WHERE id=${hash(state)}`).length,1);
 const response=await fetch(cb,{headers:{Cookie:'wharf_session='+memberToken},redirect:'manual'});assert.ok(response.headers.get('location').includes('cancelled'));assert.equal((await sql`SELECT id FROM oauth_states WHERE id=${hash(state)}`).length,0);
 const replay=await fetch(cb,{headers:{Cookie:'wharf_session='+memberToken},redirect:'manual'});assert.ok(replay.headers.get('location').includes('expired'));
 console.log('Passed: planner/member permissions, anonymous privacy, invalid keys, CSRF, leave, session-bound OAuth state and replay protection.');
}finally{await sql`DELETE FROM requests WHERE id=${d.id}`;await sql`DELETE FROM sessions WHERE id=${memberId} OR id=${hash(ownerCookie.split('=')[1])}`}
