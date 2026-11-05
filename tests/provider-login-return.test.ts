import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadWithMocks} from './module-fixture.ts';

test('legacy iCloud password submission is rejected without connecting or joining',async()=>{
 let joined=0;
 const {POST}=loadWithMocks<{POST:(request:Request)=>Promise<Response>}>(new URL('../app/api/auth/calendar/start/route.ts',import.meta.url),{
  '@/lib/calendar-intent':{beginCalendarIntent:async()=>({}),currentCalendarIntent:()=>({}),runCalendarIntent:async(_intent:unknown,work:()=>Promise<unknown>)=>work()},
  '@/app/api/auth/google/start/route':{},
  '@/lib/auth':{json:(data:unknown,status=200)=>Response.json(data,{status}),sameOrigin:()=>true,appUrl:()=> 'https://wharf.example',sql:()=>async()=>[],hash:()=> 'test-account'},
  'node:crypto':{},
  '@/lib/provider-flow':{connectionContext:async()=>({s:{id:'test-session'},row:null,inviteeId:null}),joinProviderMeeting:async()=>{joined++}},
  '@/lib/provider-connections':{storeProviderConnection:async()=>{}},
  '@/lib/microsoft-calendar':{},
  '@/lib/icloud-calendar':{icloudClient:async()=>({account:{principalUrl:'https://caldav.icloud.com/test-principal/'},fetchCalendars:async()=>[{url:'https://caldav.icloud.com/test-calendar/'}]})},
  '@/lib/calendar-invitation':{validEmail:()=>true},
  '@/lib/token-vault':{tokenVaultConfigured:()=>true},
 });
 const result=await POST(new Request('https://wharf.example/api/auth/calendar/start',{method:'POST',body:JSON.stringify({provider:'icloud',username:'test@example.test',password:'abcdefghijklmnop',returnMeetingId:'current-meeting'})}));
 assert.equal(result.status,410);
 assert.match((await result.json()).error,/Choose Google or Microsoft/);
 assert.equal(joined,0);
});
