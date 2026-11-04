import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EVENT_SCOPE,grantHasEventWrite,googleEventPayload,createOrRecoverGoogleEvent,type EventTransport} from '../lib/google-event-payload.ts';
const input={id:'meeting-one',title:'Team planning',start:Date.parse('2026-11-02T16:00Z'),end:Date.parse('2026-11-02T16:30Z'),zone:'America/Denver',organizerSub:'planner-sub',organizerEmail:'planner@example.com',attendees:[{name:'Planner',email:'planner@example.com'},{name:'Guest',email:'guest@example.com'},{name:'Guest',email:'GUEST@example.com'}],url:'https://wharfmeetings.com/?meeting=meeting-one'};
const payload=googleEventPayload(input);
const result={...payload,status:'confirmed',htmlLink:'https://www.google.com/calendar/event?eid=test',extendedProperties:payload.extendedProperties};
const failure=(status:number)=>Object.assign(new Error('Provider error'),{response:{status}});
test('Google events have stable provider IDs, local timezone, and a deduplicated guest list',()=>{
 assert.match(payload.id,/^[0-9a-v]{5,1024}$/);
 assert.equal(payload.id,googleEventPayload(input).id);
 assert.notEqual(payload.id,googleEventPayload({...input,organizerSub:'other'}).id);
 assert.equal(payload.attendees.length,1);assert.equal(payload.attendees[0].email.toLowerCase(),'guest@example.com');
 assert.equal(payload.start.dateTime,'2026-11-02T16:00:00.000Z');assert.equal(payload.start.timeZone,'America/Denver');
 assert.equal('responseStatus' in payload.attendees[0],false);
});
test('free/busy access alone never permits calendar writes',()=>{
 assert.equal(grantHasEventWrite(undefined),false);assert.equal(grantHasEventWrite('https://www.googleapis.com/auth/calendar.freebusy'),false);
 assert.equal(grantHasEventWrite(EVENT_SCOPE),true);assert.equal(grantHasEventWrite('https://www.googleapis.com/auth/calendar.events'),true);
});
test('new event invites guests with sendUpdates=all',async()=>{
 const calls:any[]=[];const client:EventTransport={async request(options){calls.push(options);if(options.method==='GET')throw failure(404);return {data:result}}};
 assert.equal((await createOrRecoverGoogleEvent(client,payload)).id,payload.id);
 assert.equal(calls.length,2);assert.equal(calls[1].params.sendUpdates,'all');assert.equal(calls[1].data.id,payload.id);
});
test('retry after a lost response recovers the event without another insert',async()=>{
 let inserted=false,posts=0;const client:EventTransport={async request(options){if(options.method==='GET'){if(!inserted)throw failure(404);return {data:result}}posts++;inserted=true;throw failure(504)}};
 await assert.rejects(createOrRecoverGoogleEvent(client,payload));
 assert.equal((await createOrRecoverGoogleEvent(client,payload)).id,payload.id);assert.equal(posts,1);
});
test('concurrent insert conflict recovers the same event',async()=>{
 let reads=0;const client:EventTransport={async request(options){if(options.method==='GET'){if(reads++===0)throw failure(404);return {data:result}}throw failure(409)}};
 assert.equal((await createOrRecoverGoogleEvent(client,payload)).id,payload.id);assert.equal(reads,2);
});
test('authorization failures never insert events',async()=>{
 let posts=0;const client:EventTransport={async request(options){if(options.method==='POST')posts++;throw failure(403)}};
 await assert.rejects(createOrRecoverGoogleEvent(client,payload));assert.equal(posts,0);
});
test('cancelled or unrelated provider events are not recreated',async()=>{
 for(const event of [{...result,status:'cancelled'},{...result,extendedProperties:{private:{wharfMeetingId:'other'}}}]){
  let posts=0;const client:EventTransport={async request(options){if(options.method==='POST')posts++;return {data:event}}};
  await assert.rejects(createOrRecoverGoogleEvent(client,payload));assert.equal(posts,0);
 }
});

test('recovery accepts RSVP changes but rejects changed times or guest lists',async()=>{
 const accepted={...result,attendees:[{email:'guest@example.com',responseStatus:'accepted'},{email:'planner@example.com',organizer:true}]};
 assert.equal((await createOrRecoverGoogleEvent({async request(){return {data:accepted}}},payload)).id,payload.id);
 for(const event of [{...result,start:{dateTime:'2026-11-02T17:00:00Z'}},{...result,attendees:[]},{...result,attendees:[...payload.attendees,{email:'extra@example.com'}]}]){
  let posts=0;const client:EventTransport={async request(options){if(options.method==='POST')posts++;return {data:event}}};
  await assert.rejects(createOrRecoverGoogleEvent(client,payload));assert.equal(posts,0);
 }
});
