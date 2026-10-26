import {test} from 'node:test';
import assert from 'node:assert/strict';
import {slackDateContext} from '../lib/slack-agent.ts';
import {createMeetingSchema,toConstraints} from '../lib/agent-contract.ts';
import {allowed} from '../lib/availability.ts';
test('Monday distinguishes coming Tuesday from next-week Tuesday and rolls the year',()=>{
 const context=slackDateContext('America/Denver',Date.parse('2026-10-26T22:30Z'));
 assert.match(context,/2026-10-26 16:30 \(Monday\)/);
 assert.match(context,/Tuesday: coming 2026-10-27, next-week 2026-11-03/);
 assert.match(context,/Thursday: coming 2026-10-29, next-week 2026-11-05/);
 assert.match(slackDateContext('UTC',Date.parse('2026-12-31T12:00Z')),/Tuesday: coming 2027-01-05, next-week 2027-01-05/);
});
test('date context uses requester timezone, including DST boundary and rounding into tomorrow',()=>{
 assert.match(slackDateContext('America/Denver',Date.parse('2026-11-01T06:30Z')),/2026-11-01 00:30 \(Sunday\)/);
 assert.match(slackDateContext('America/Denver',Date.parse('2026-10-27T05:59:45Z')),/2026-10-27 00:00 \(Tuesday\)/);
});
test('agent contract preserves continuous boundaries when saving meeting constraints',()=>{
 const draft=createMeetingSchema.parse({startDate:'2026-10-26',endDate:'2026-10-27',dayStart:'20:00',dayEnd:'18:00',windowMode:'continuous',timezone:'UTC',participants:[{id:'U1',name:'Ben'}]});
 const constraints=toConstraints(draft);assert.equal(constraints.windowStart,'2026-10-26T20:00');assert.equal(constraints.windowEnd,'2026-10-27T18:00');assert.equal(allowed(constraints).length,2);
 assert.throws(()=>createMeetingSchema.parse({...draft,windowMode:'daily'}));
 const midnight=createMeetingSchema.parse({...draft,endDate:'2026-10-26',dayEnd:'24:00'});assert.equal(allowed(toConstraints(midnight))[0].end,Date.parse('2026-10-27T00:00Z'));
});
