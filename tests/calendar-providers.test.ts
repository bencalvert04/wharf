import {test} from 'node:test';
import assert from 'node:assert/strict';
import {microsoftBusy,icloudBusy,clipProviderBusy} from '../lib/provider-busy.ts';
import {microsoftAvailability,microsoftAuthorize,microsoftTokens,graphCalendarUrl} from '../lib/microsoft-calendar.ts';
import {appleCalendarUrl,appleCalendarFetch} from '../lib/icloud-calendar.ts';
import type {Constraints} from '../lib/availability.ts';
const c:Constraints={title:'Team',start:'2026-11-02',end:'2026-11-04',duration:30,zone:'America/Denver',from:'00:00',to:'24:00',days:[0,1,2,3,4,5,6]};
const msEvent=(start='2026-11-02T16:00:00',end='2026-11-02T17:00:00',showAs='busy')=>({start:{dateTime:start,timeZone:'UTC'},end:{dateTime:end,timeZone:'UTC'},showAs,isCancelled:false});
const ics=(event:string)=>({data:'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+event+'\r\nEND:VCALENDAR'});
const event=(body:string)=>'BEGIN:VEVENT\r\nUID:one\r\n'+body+'\r\nEND:VEVENT';
test('Outlook excludes free/cancelled events, blocks tentative/OOF/unknown, and rejects malformed times',()=>{
 const events=[msEvent(),msEvent(undefined,undefined,'tentative'),msEvent(undefined,undefined,'oof'),msEvent(undefined,undefined,'unknown'),msEvent(undefined,undefined,'free'),{...msEvent(),isCancelled:true}];
 assert.equal(microsoftBusy(events).length,4);
 assert.throws(()=>microsoftBusy(undefined));
 assert.throws(()=>microsoftBusy([{...msEvent(),start:{dateTime:'garbage',timeZone:'UTC'}}]));
 assert.throws(()=>microsoftBusy([{...msEvent(),start:{dateTime:'2026-11-02T10:00:00',timeZone:'America/Denver'}}]));
 assert.throws(()=>microsoftBusy([msEvent('2026-11-02T18:00:00','2026-11-02T17:00:00')]));
});
test('Outlook uses minimal fields, expands occurrences via calendarView, and follows every safe page',async t=>{
 const urls:string[]=[];
 t.mock.method(globalThis,'fetch',async(url:any,init:any)=>{
  urls.push(String(url));assert.equal(init.headers.Prefer,'outlook.timezone="UTC"');
  return Response.json({value:[msEvent()],...(urls.length===1?{'@odata.nextLink':'https://graph.microsoft.com/v1.0/me/calendarView?$skiptoken=next'}:{})});
 });
 const busy=await microsoftAvailability('private-access-token',c);
 assert.equal(busy.length,2);assert.equal(urls.length,2);
 const query=new URL(urls[0]).searchParams;
 assert.equal(query.get('$select'),'start,end,showAs,isCancelled');
 assert.equal(query.get('startDateTime'),'2026-11-02T07:00:00.000Z');
});
test('Outlook fails closed on later-page errors and rejects foreign next links before sending credentials',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return calls===1?Response.json({value:[msEvent()],'@odata.nextLink':'https://attacker.example/steal'}):Response.json({value:[]})});
 await assert.rejects(microsoftAvailability('secret',c),/Invalid Microsoft/);assert.equal(calls,1);
 assert.throws(()=>graphCalendarUrl('https://graph.microsoft.com.evil.test/v1.0/me/calendarView'));
 assert.throws(()=>graphCalendarUrl('https://graph.microsoft.com/v1.0/me/messages'));
});
test('Microsoft code exchange uses PKCE, server secret and the exact callback without calendar write access',async t=>{
 const oldId=process.env.MICROSOFT_CLIENT_ID,oldSecret=process.env.MICROSOFT_CLIENT_SECRET;process.env.MICROSOFT_CLIENT_ID='test-client';process.env.MICROSOFT_CLIENT_SECRET='test-secret';t.after(()=>{if(oldId===undefined)delete process.env.MICROSOFT_CLIENT_ID;else process.env.MICROSOFT_CLIENT_ID=oldId;if(oldSecret===undefined)delete process.env.MICROSOFT_CLIENT_SECRET;else process.env.MICROSOFT_CLIENT_SECRET=oldSecret});
 t.mock.method(globalThis,'fetch',async(url:any,init:any)=>{
  assert.match(String(url),/microsoftonline.com/);assert.equal(init.body.get('code_verifier'),'verifier');assert.equal(init.body.get('redirect_uri'),'https://wharf.example/api/auth/microsoft/callback');
  assert.doesNotMatch(init.body.get('scope'),/ReadWrite/i);
  return Response.json({access_token:'access',refresh_token:'refresh',scope:'Calendars.ReadBasic'});
 });
 const url=new URL(microsoftAuthorize('state','challenge'));
 assert.equal(url.searchParams.get('state'),'state');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.doesNotMatch(url.searchParams.get('scope')!,/ReadWrite/);
 await microsoftTokens({grant_type:'authorization_code',code:'code',code_verifier:'verifier',redirect_uri:'https://wharf.example/api/auth/microsoft/callback'});
});
test('iCloud recurring events honor exceptions, cancellations, and transparency',async()=>{
 const recurring=event('DTSTART:20261102T160000Z\r\nDTEND:20261102T170000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEXDATE:20261103T160000Z');
 const busy=await icloudBusy([ics(recurring)],c);
 assert.deepEqual(busy,[{start:Date.parse('2026-11-02T16:00Z'),end:Date.parse('2026-11-02T17:00Z')},{start:Date.parse('2026-11-04T16:00Z'),end:Date.parse('2026-11-04T17:00Z')}]);
 for(const flag of ['STATUS:CANCELLED','TRANSP:TRANSPARENT'])assert.deepEqual(await icloudBusy([ics(event('DTSTART:20261102T160000Z\r\nDTEND:20261102T170000Z\r\n'+flag))],c),[]);
 await assert.rejects(icloudBusy([{data:'truncated'}],c),/Incomplete/);
});
test('iCloud server-expanded overrides are included and all-day events use local midnight across DST',async()=>{
 const overrides=ics(event('RECURRENCE-ID:20261102T160000Z\r\nDTSTART:20261102T180000Z\r\nDTEND:20261102T190000Z'));
 assert.deepEqual(await icloudBusy([overrides],c),[{start:Date.parse('2026-11-02T18:00Z'),end:Date.parse('2026-11-02T19:00Z')}]);
 const dst={...c,start:'2026-11-01',end:'2026-11-01'};
 const busy=await icloudBusy([ics(event('DTSTART;VALUE=DATE:20261101\r\nDTEND;VALUE=DATE:20261102'))],dst);
 assert.deepEqual(busy,[{start:Date.parse('2026-11-01T06:00Z'),end:Date.parse('2026-11-02T07:00Z')}]);
});
test('provider intervals are clipped to meeting hours and bad intervals fail rather than appear free',()=>{
 const work={...c,start:'2026-11-02',end:'2026-11-02',from:'09:00',to:'17:00'};
 assert.deepEqual(clipProviderBusy([{start:Date.parse('2026-11-02T00:00Z'),end:Date.parse('2026-11-04T00:00Z')}],work),[{start:Date.parse('2026-11-02T16:00Z'),end:Date.parse('2026-11-03T00:00Z')}]);
 assert.throws(()=>clipProviderBusy([{start:NaN,end:1}],work));
});
test('iCloud credentials cannot be sent to foreign hosts, insecure redirects or write endpoints',async t=>{
 for(const url of ['http://caldav.icloud.com/','https://caldav.icloud.com.evil.test/','https://evil.test/','https://user:pass@caldav.icloud.com/','https://p01-caldav.icloud.com:444/'])assert.throws(()=>appleCalendarUrl(url));
 assert.equal(appleCalendarUrl('https://p01-caldav.icloud.com/123/'),'https://p01-caldav.icloud.com/123/');
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://evil.test/'}})});
 await assert.rejects(appleCalendarFetch('https://caldav.icloud.com/',{method:'PROPFIND',headers:{Authorization:'secret'}}),/Invalid Apple/);assert.equal(calls,1);
 await assert.rejects(appleCalendarFetch('https://caldav.icloud.com/',{method:'PUT',body:'event'}),/writes/);assert.equal(calls,1);
});
