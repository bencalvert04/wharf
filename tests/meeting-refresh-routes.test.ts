import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadWithMocks} from './module-fixture.ts';
import {availabilityRevision,validFinalSlot,validAlternativeSlot} from '../lib/finalization.ts';
class AvailabilityRefreshError extends Error{}
const start=Date.parse('2035-01-02T10:00Z'),end=start+1800000;
const c={title:'Planning',start:'2035-01-02',end:'2035-01-02',duration:30,zone:'UTC',from:'09:00',to:'17:00',days:[0,1,2,3,4,5,6]};
const person={google_sub:'google',name:'Alex',email:'alex@example.test',busy:[] as {start:number;end:number}[]};
for(const outcome of ['unchanged','changed','failed','unauthorized','finalized'])test(`final check: ${outcome}`,async()=>{
 let people=[{...person}],refreshes=0,commits=0,deliveries=0;
 const final=outcome==='finalized'?{start,end}:null;
 const {POST}=loadWithMocks<any>(new URL('../app/api/requests/[id]/finalize/route.ts',import.meta.url),{
  '@/lib/meeting-refresh':{AvailabilityRefreshError,refreshMeetingAvailability:async(_id:string,force:boolean)=>{assert.equal(force,true);refreshes++;if(outcome==='failed')throw new AvailabilityRefreshError('Could not check Alex');if(outcome==='changed')people=[{...person,busy:[{start,end}]}];}},
  '@/lib/provider-connections':{providerConnection:async()=>null},'@/lib/commit-finalization':{},'@/lib/invitations':{},
  '@/lib/planner-access':{plannerAccess:async()=>({allowed:outcome!=='unauthorized'})},
  '@/lib/slack-web-booking':{},'@/lib/agent-api':{AgentError:class extends Error{}},
  '@/lib/auth':{sameOrigin:()=>true,session:async()=>({id:'session',google_sub:'google',email:person.email}),meeting:async()=>({id:'meeting',constraints:JSON.stringify(c),final_time:final}),sql:()=>async()=>people,json:(body:unknown,status=200)=>Response.json(body,{status})},
  '@/lib/finalization':{availabilityRevision,validFinalSlot,validAlternativeSlot},'@/lib/calendar-invitation':{validEmail:()=>true},
  '@/lib/google-meeting-events':{CalendarPermissionRequired:class extends Error{},googleMeetingEvent:async()=>({}),eventConnection:async()=>{},commitGoogleFinalization:async()=>{commits++;return true},deliverGoogleEvent:async()=>{deliveries++;return {status:'created'}}},
 });
 const response=await POST(new Request('https://wharf.example/api/requests/meeting/finalize',{method:'POST',body:JSON.stringify({start,end,revision:availabilityRevision([person])})}),{params:Promise.resolve({id:'meeting'})});
 const body=await response.json();
 if(outcome==='unchanged'){assert.equal(response.status,200);assert.equal(commits,1);assert.equal(deliveries,1)}
 if(outcome==='changed'){assert.equal(response.status,409);assert.equal(body.code,'AVAILABILITY_CHANGED');assert.match(body.error,/Alex/)}
 if(outcome==='failed'){assert.equal(response.status,409);assert.equal(body.code,'AVAILABILITY_REFRESH_FAILED')}
 if(['changed','failed','unauthorized'].includes(outcome)){assert.equal(commits,0);assert.equal(deliveries,0)}
 assert.equal(refreshes,['unauthorized','finalized'].includes(outcome)?0:1);
 if(outcome==='unauthorized')assert.equal(response.status,403);
 if(outcome==='finalized'){assert.equal(response.status,200);assert.equal(commits,0);assert.equal(deliveries,1)}
});
for(const kind of ['planner','joined','outsider','anonymous','cross-origin','finalized'])test(`refresh endpoint access: ${kind}`,async()=>{
 let reads=0;
 const {POST}=loadWithMocks<any>(new URL('../app/api/requests/[id]/refresh/route.ts',import.meta.url),{
  '@/lib/auth':{sameOrigin:()=>kind!=='cross-origin',session:async()=>kind==='anonymous'?null:{id:'session',google_sub:'google'},meeting:async()=>({id:'meeting',constraints:'{}',final_time:kind==='finalized'?{}:null}),sql:()=>async()=>kind==='joined'?[{}]:[],json:(body:unknown,status=200)=>Response.json(body,{status})},
  '@/lib/planner-access':{plannerAccess:async()=>({allowed:['planner','finalized'].includes(kind)})},'@/lib/manual-attendee':{manualAttendeeId:()=> 'manual:guest'},
  '@/lib/meeting-refresh':{AvailabilityRefreshError,refreshMeetingAvailability:async()=>{reads++},meetingRefreshStatus:async()=>({checkedAt:'2035-01-01',error:null,refreshing:false})}
 });
 const response=await POST(new Request('https://wharf.example/api/requests/meeting/refresh',{method:'POST'}),{params:Promise.resolve({id:'meeting'})});
 assert.equal(response.status,['planner','joined','finalized'].includes(kind)?200:403);
 assert.equal(reads,['planner','joined'].includes(kind)?1:0);
});
