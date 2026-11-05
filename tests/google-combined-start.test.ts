import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadWithMocks} from './module-fixture.ts';
import {grantHasFreeBusy} from '../lib/calendar-access.ts';
import {grantHasEventWrite} from '../lib/google-event-payload.ts';
const freebusy='https://www.googleapis.com/auth/calendar.freebusy';
const events='https://www.googleapis.com/auth/calendar.events.owned';

async function start({planner=false,account=null as string|null,savedScopes='',savedJoin=false,meeting=true,connectCalendar=false}={}){
 const flows:unknown[][]=[];let removed=0,reads=0,checks=0;
 const {POST}=loadWithMocks<{POST:(r:Request)=>Promise<Response>}>(new URL('../app/api/auth/google/start/route.ts',import.meta.url),{
  '@/lib/calendar-intent':{beginCalendarIntent:async()=>({}),runCalendarIntent:(_intent:unknown,work:()=>Promise<unknown>)=>work()},
  '@/lib/provider-switch-guard':{isStandaloneProviderAccount:()=>false,captureGoogleSwitch:async()=>({check:async()=>{checks++},remove:async()=>{removed++}})},
  '@/lib/auth':{sameOrigin:()=>true,json:(data:unknown,status=200)=>Response.json(data,{status}),session:async()=>({id:'session',google_sub:account}),meeting:async()=>({id:'meeting',constraints:'{}'}),sql:()=>async()=>[],appUrl:()=> 'https://wharf.example'},
  '@/lib/google':{configured:()=>true},'@/lib/google-flow':{beginGoogleFlow:async(...args:unknown[])=>{flows.push(args);return 'https://accounts.google.com/authorize'}},
  '@/lib/planner-access':{plannerAccess:async()=>({allowed:planner})},'@/lib/google-event-payload':{grantHasEventWrite},'@/lib/calendar-access':{grantHasFreeBusy},
  '@/lib/calendar-connection':{calendarConnection:async()=>savedScopes?{refresh_token:'saved',granted_scopes:savedScopes}:null,joinWithSavedCalendar:async(_row:unknown,_sub:unknown,_name:unknown,_session:unknown,_invite:unknown,googleOnly:boolean,check:()=>Promise<void>)=>{assert.equal(googleOnly,true);await check();reads++;return savedJoin}},
  '@/lib/meeting-participation':{resolveInvitation:async()=>null},'@/lib/token-vault':{tokenVaultConfigured:()=>true},
 });
 const response=await POST(new Request('https://wharf.example/api/auth/google/start',{method:'POST',body:JSON.stringify({...(meeting?{meetingId:'meeting'}:{}),connectCalendar})}));
 return {response,body:await response.json(),flows,removed,reads,checks};
}

test('provider Google entry preserves planner-only event consent and attendee combined consent',async()=>{
 for(const planner of [false,true]){
  const result=await start({planner});assert.equal(result.response.status,200);
  assert.equal(result.flows.length,1);assert.equal(result.flows[0][5],planner?'planner_connect':'join');
  assert.equal(result.removed,0);
 }
});
test('returning planner upgrades event permission before saved availability reuse',async()=>{
 const result=await start({planner:true,account:'google-user',savedScopes:freebusy,savedJoin:true});
 assert.equal(result.flows[0][5],'planner_connect');assert.equal(result.reads,0);assert.equal(result.removed,0);
});
test('saved Google join keeps provider-switch checks and avoids another authorization trip',async()=>{
 const result=await start({planner:true,account:'google-user',savedScopes:freebusy+' '+events,savedJoin:true});
 assert.equal(result.body.joined,true);assert.equal(result.flows.length,0);assert.equal(result.checks,1);assert.equal(result.removed,1);
});
test('plain header login stays identity-only and explicit linking requests calendar consent',async()=>{
 for(const connectCalendar of [false,true]){
  const result=await start({meeting:false,connectCalendar});
  assert.equal(result.flows[0][5],connectCalendar?'connect':'join');assert.equal(result.removed,0);
 }
});
