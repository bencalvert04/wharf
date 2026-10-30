import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadWithMocks} from './module-fixture.ts';

test('iCloud header login returns to the current meeting without claiming it was joined',async()=>{
 let joined=0;
 const {POST}=loadWithMocks<{POST:(request:Request)=>Promise<Response>}>(new URL('../app/api/auth/calendar/start/route.ts',import.meta.url),{
  '@/lib/calendar-intent':{beginCalendarIntent:async()=>({}),currentCalendarIntent:()=>({}),runCalendarIntent:async(_intent:unknown,work:()=>Promise<unknown>)=>work()},
  '@/app/api/auth/google/start/route':{},
  '@/lib/auth':{json:Response.json,sameOrigin:()=>true,appUrl:()=> 'https://wharf.example',sql:()=>async()=>[],hash:()=> 'test-account'},
  'node:crypto':{},
  '@/lib/provider-flow':{connectionContext:async()=>({s:{id:'test-session'},row:null,inviteeId:null}),joinProviderMeeting:async()=>{joined++}},
  '@/lib/provider-connections':{storeProviderConnection:async()=>{}},
  '@/lib/microsoft-calendar':{},
  '@/lib/icloud-calendar':{icloudClient:async()=>({account:{principalUrl:'https://caldav.icloud.com/test-principal/'},fetchCalendars:async()=>[{url:'https://caldav.icloud.com/test-calendar/'}]})},
  '@/lib/calendar-invitation':{validEmail:()=>true},
  '@/lib/token-vault':{tokenVaultConfigured:()=>true},
 });
 const result=await POST(new Request('https://wharf.example/api/auth/calendar/start',{method:'POST',body:JSON.stringify({provider:'icloud',username:'test@example.test',password:'abcdefghijklmnop',returnMeetingId:'current-meeting'})}));
 assert.equal(result.status,200);
 const url=new URL((await result.json()).url);
 assert.equal(url.searchParams.get('meeting'),'current-meeting');
 assert.equal(url.searchParams.get('calendar'),'connected');
 assert.equal(joined,0);
});
