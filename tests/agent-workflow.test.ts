import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMeetingSchema,toConstraints} from '../lib/agent-contract.ts';
import {meetingSlots} from '../lib/agent-slots.ts';
const basic={startDate:'2030-01-07',timezone:'UTC',participants:[{id:'ray',name:'Ray'}]};
test('agent defaults mean a single day, all weekdays and explicit timezone',()=>{
 const v=createMeetingSchema.parse(basic),c=toConstraints(v);assert.equal(c.start,c.end);assert.equal(c.duration,30);assert.equal(c.from,'09:00');assert.deepEqual(c.days,[0,1,2,3,4,5,6]);
 for(const patch of [{timezone:undefined},{timezone:'Invalid/Zone'},{startDate:'2030-02-30'},{endDate:'2030-02-08'},{participants:[]},{participants:[{id:'x',name:'X'},{id:'x',name:'Y'}]},{extra:true}])assert.equal(createMeetingSchema.safeParse({...basic,...patch}).success,false);
});
test('agent slots fit exact duration, reject past starts and never treat empty calendars as consensus',()=>{
 const c=toConstraints(createMeetingSchema.parse({...basic,durationMinutes:45,dayStart:'09:00',dayEnd:'11:00'}));
 assert.deepEqual(meetingSlots('m',c,[],0),[]);
 const slots=meetingSlots('m',c,[{name:'Ray',busy:[]}],Date.parse('2030-01-07T09:01Z'));
 assert.equal(slots[0].start,'2030-01-07T09:15:00.000Z');assert.equal(slots.at(-1)?.end,'2030-01-07T11:00:00.000Z');assert.ok(slots.every(s=>Date.parse(s.end)-Date.parse(s.start)===45*60000));
 assert.deepEqual(slots,meetingSlots('m',c,[{name:'Ray',busy:[]}],Date.parse('2030-01-07T09:01Z')));
});
test('DST repeated local times have distinct absolute slots and IDs',()=>{
 const c=toConstraints(createMeetingSchema.parse({...basic,startDate:'2030-11-03',timezone:'America/New_York',dayStart:'00:00',dayEnd:'04:00'}));
 const slots=meetingSlots('dst',c,[{name:'Ray',busy:[]}],0),ones=slots.filter(s=>s.localStart.time==='01:00');assert.equal(ones.length,2);assert.notEqual(ones[0].id,ones[1].id);assert.notEqual(ones[0].start,ones[1].start);
});
test('a conflict blocks only intersecting exact slots',()=>{
 const c=toConstraints(createMeetingSchema.parse({...basic,durationMinutes:45,dayEnd:'11:00'}));
 const slots=meetingSlots('m',c,[{name:'Ray',busy:[{start:Date.parse('2030-01-07T10:00Z'),end:Date.parse('2030-01-07T10:30Z')}]}],0);
 assert.equal(slots.length,2);assert.ok(slots.every(s=>Date.parse(s.end)<=Date.parse('2030-01-07T10:00Z')));
});
test('open API meetings accept no roster while preserving human meeting constraints',()=>{
 const v=createMeetingSchema.parse({startDate:'2030-01-07',timezone:'UTC',openJoin:true});
 assert.deepEqual(v.participants,[]);assert.equal(toConstraints(v).openJoin,true);
 assert.equal(createMeetingSchema.safeParse({...basic,openJoin:true}).success,false);
 assert.equal(createMeetingSchema.safeParse({startDate:'2030-01-07',timezone:'UTC'}).success,false);
});
