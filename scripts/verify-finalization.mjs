import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sql} from '../lib/auth.ts';
import {commitFinalization} from '../lib/commit-finalization.ts';
const db=sql(),ids=[];
const c={title:'Synthetic finalization verification',start:'2026-11-02',end:'2026-11-02',duration:30,zone:'UTC',from:'09:00',to:'17:00',days:[1]};
const people=[{google_sub:'synthetic-planner',name:'Planner',email:'planner@example.com',busy:[]},{google_sub:'synthetic-guest',name:'Guest',email:'guest@example.com',busy:[]}];
const start=Date.parse('2026-11-02T09:00Z'),end=start+1800000;
process.env.INVITATION_FROM='wharfmeetings@gmail.com';
async function fixture(){const id=randomUUID();ids.push(id);await db`INSERT INTO requests(id,constraints,created_at,planner_key) VALUES(${id},${JSON.stringify(c)},${new Date().toISOString()},'synthetic')`;for(const p of people)await db`INSERT INTO attendees(meeting_id,google_sub,name,email,busy) VALUES(${id},${p.google_sub},${p.name},${p.email},'[]')`;return id}
try{
 const id=await fixture();
 assert.equal(await commitFinalization(id,c,people,start,end),true);
 assert.equal(await commitFinalization(id,c,people,start,end),true);
 const jobs=await db`SELECT payload FROM invitation_outbox WHERE meeting_id=${id}`;
 assert.equal(jobs.length,2);
 assert.deepEqual(jobs.map(j=>j.payload.to[0]).sort(),['guest@example.com','planner@example.com']);
 await assert.rejects(db`INSERT INTO attendees(meeting_id,google_sub,name,email,busy) VALUES(${id},'late','Late','late@example.com','[]')`);
 await assert.rejects(db`DELETE FROM attendees WHERE meeting_id=${id}`);
 assert.equal(await commitFinalization(id,c,people,start+3600000,end+3600000),false);
 const stale=await fixture();await db`DELETE FROM attendees WHERE meeting_id=${stale} AND google_sub='synthetic-guest'`;
 assert.equal(await commitFinalization(stale,c,people,start,end),false);
 assert.equal((await db`SELECT id FROM invitation_outbox WHERE meeting_id=${stale}`).length,0);
 const race=await fixture();
 const outcomes=await Promise.all([commitFinalization(race,c,people,start,end),commitFinalization(race,c,people,start+3600000,end+3600000)]);
 assert.deepEqual(outcomes.sort(),[false,true]);
 assert.equal((await db`SELECT id FROM invitation_outbox WHERE meeting_id=${race}`).length,2);
 console.log('Database verification passed: atomic outbox, planner inclusion, idempotent retry, stale snapshot, concurrent finalization and frozen attendees. No email sent.');
}finally{for(const id of ids)await db`DELETE FROM requests WHERE id=${id}`;console.log('Synthetic fixtures removed.')}
