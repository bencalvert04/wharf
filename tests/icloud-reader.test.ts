import {test} from 'node:test';
import assert from 'node:assert/strict';
import {icloudAvailabilityFromClient,appleCalendarFetch} from '../lib/icloud-calendar.ts';
import type {Constraints} from '../lib/availability.ts';
const c:Constraints={title:'Team',start:'2026-11-02',end:'2026-11-02',duration:30,zone:'America/Denver',from:'09:00',to:'17:00',days:[1]};
const calendar=(name:string,components=['VEVENT'])=>({url:`https://p01-caldav.icloud.com/123/${name}/`,components});
const data='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:one\r\nDTSTART:20261102T160000Z\r\nDTEND:20261102T170000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
test('iCloud reader queries all event calendars, expands events and ignores reminder-only calendars',async()=>{
 const urls:string[]=[];
 const result=await icloudAvailabilityFromClient({fetchCalendars:async()=>[calendar('home'),calendar('work'),calendar('reminders',['VTODO'])],fetchCalendarObjects:async input=>{
  urls.push(input.calendar.url);assert.equal(input.expand,true);assert.equal(input.useMultiGet,false);
  assert.equal(input.timeRange?.start,'2026-11-02T16:00:00.000Z');assert.equal(input.timeRange?.end,'2026-11-03T00:00:00.000Z');
  return [{url:calendar('home').url+'one.ics',data}];
 }},c);
 assert.equal(urls.length,2);assert.equal(result.length,2);
});
test('a failed later calendar or invalid discovery URL never returns partial free/busy',async()=>{
 for(const badUrl of [false,true]){
  let calls=0;
  const calendars=[calendar('home'),badUrl?{...calendar('work'),url:'https://attacker.example/calendar/'}:calendar('work')];
  await assert.rejects(icloudAvailabilityFromClient({fetchCalendars:async()=>calendars,fetchCalendarObjects:async()=>{
   if(++calls===2)throw Error('Provider unavailable');return [{url:calendar('home').url+'one.ics',data}];
  }},c));
  assert.equal(calls,badUrl?1:2);
 }
});
test('empty calendars remain valid, but missing calendars and malformed data fail',async()=>{
 const client={fetchCalendars:async()=>[calendar('home')],fetchCalendarObjects:async()=>[]};
 assert.deepEqual(await icloudAvailabilityFromClient(client,c),[]);
 await assert.rejects(icloudAvailabilityFromClient({...client,fetchCalendars:async()=>[]},c),/No iCloud/);
 await assert.rejects(icloudAvailabilityFromClient({...client,fetchCalendarObjects:async()=>[{url:calendar('home').url+'one.ics',data:'truncated'}]},c),/Incomplete/);
});
test('Apple read transport preserves Request method and headers and uses one deadline across redirects',async t=>{
 const signals:AbortSignal[]=[];
 t.mock.method(globalThis,'fetch',async(_url:any,init:any)=>{
  assert.equal(init.method,'PROPFIND');assert.equal(new Headers(init.headers).get('Authorization'),'test-secret');
  signals.push(init.signal);
  return signals.length===1?new Response(null,{status:307,headers:{location:'https://p01-caldav.icloud.com/123/'}}):new Response('',{status:207});
 });
 await appleCalendarFetch(new Request('https://caldav.icloud.com/',{method:'PROPFIND',headers:{Authorization:'test-secret'}}));
 assert.equal(signals.length,2);assert.equal(signals[0],signals[1]);
 await assert.rejects(appleCalendarFetch(new Request('https://caldav.icloud.com/',{method:'DELETE'})),/writes/);
});
test('Apple read transport respects cancellation without dropping request bodies',async t=>{
 const controller=new AbortController();controller.abort();
 t.mock.method(globalThis,'fetch',async(_url:any,init:any)=>{assert.equal(init.body,'<report/>');init.signal.throwIfAborted();return new Response();});
 await assert.rejects(appleCalendarFetch('https://caldav.icloud.com/',{method:'REPORT',body:'<report/>',signal:controller.signal}),{name:'AbortError'});
 await assert.rejects(appleCalendarFetch(new Request('https://caldav.icloud.com/',{method:'REPORT',body:'<report/>'})),/body explicitly/);
});
