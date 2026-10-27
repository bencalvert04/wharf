import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demoConstraints,samplePeople} from '../lib/demo.ts';
import {shared} from '../lib/availability.ts';
test('demo uses a future workweek with standard hours and no inherited continuous bounds',()=>{
 const c=demoConstraints('America/Denver',Date.parse('2026-10-27T04:00:00Z'));
 assert.equal(c.start,'2026-11-02');assert.equal(c.end,'2026-11-06');
 assert.equal(c.from,'09:00');assert.equal(c.to,'17:00');assert.equal(c.duration,30);
 assert.equal(c.windowStart,undefined);assert.equal(c.windowEnd,undefined);
 for(let count=1;count<=4;count++)assert.ok(shared(c,samplePeople(c).slice(0,count)).some(w=>w.end-w.start>=30*60000));
});
test('Sunday demo starts the following day, Monday demo starts next week',()=>{
 assert.equal(demoConstraints('UTC',Date.parse('2026-11-01T12:00Z')).start,'2026-11-02');
 assert.equal(demoConstraints('UTC',Date.parse('2026-11-02T12:00Z')).start,'2026-11-09');
});
