import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadWithMocks} from './module-fixture.ts';
import {grantHasFreeBusy} from '../lib/calendar-access.ts';
import {grantHasEventWrite} from '../lib/google-event-payload.ts';
const scope='openid profile email https://www.googleapis.com/auth/calendar.freebusy';
async function complete({refresh=true,saved=false,permission=true,meeting=true,planner=false,eventPermission=false,onScopeSave=async(_sub:string,_token:string,_generation:{version:number;connectionId:string},_scopes:string)=>{}}={}){
 let stored=0,snapshots=0,removed=0,extraAuthorization=0;
 const flow={calendar_intent:{},purpose:planner?'planner_connect':'connect',meeting_id:meeting?'meeting':null,nonce:'nonce'};
 const {GET}=loadWithMocks<{GET:(request:Request)=>Promise<Response>}>(new URL('../app/api/auth/google/callback/route.ts',import.meta.url),{
  '@/lib/planner-access':{},'next/server':{},'@/lib/slack-workflow':{},'@/lib/slack-attendance':{},'@/lib/agent-calendar-authorization':{},'@/lib/google-event-payload':{},
  '@/lib/auth':{session:async()=>({id:'session',google_sub:null}),hash:()=> 'hashed',appUrl:()=> 'https://wharf.example',meeting:async()=>({id:'meeting',constraints:'{}'}),sql:()=>async(strings:TemplateStringsArray)=>strings.join('').includes('DELETE FROM oauth_states')?[flow]:[{id:'session'}]},
  '@/lib/calendar-invitation':{validEmail:()=>true},
  '@/lib/google':{google:()=>({getToken:async()=>({tokens:{id_token:'id',access_token:'access',...(refresh?{refresh_token:'refresh'}:{}),scope:permission?scope+(eventPermission?' https://www.googleapis.com/auth/calendar.events.owned':''):'openid'}}),verifyIdToken:async()=>({getPayload:()=>({sub:'google-user',email_verified:true,email:'user@example.test',name:'User',nonce:'nonce'})}),setCredentials:()=>{}})},
  '@/lib/google-flow':{beginGoogleFlow:async()=>{extraAuthorization++;return 'https://accounts.google.com/unwanted-extra-trip'}},
  '@/lib/calendar-connection':{prepareCalendarConsent:async()=>({version:0,connectionId:'generation'}),saveCalendarGrant:async()=>{stored++},saveCalendarScopes:onScopeSave,calendarConnection:async()=>saved?{refresh_token:'encrypted',granted_scopes:scope,disconnecting:false,version:3,connection_id:'saved-generation'}:null,saveCalendarSnapshot:async()=>{snapshots++}},
  '@/lib/calendar-access':{grantHasFreeBusy},
 });
 const response=await GET(new Request('https://wharf.example/api/auth/google/callback?code=code&state=state'));
 return {status:new URL(response.headers.get('location')!).searchParams.get('calendar'),stored,snapshots,removed,extraAuthorization};
}
test('new attendee signs in, stores ongoing access, and joins in one callback without another authorization trip',async()=>{
 assert.deepEqual(await complete(),{status:'joined',stored:1,snapshots:1,removed:0,extraAuthorization:0});
});
test('planner combined authorization also joins immediately, including when optional event access is declined',async()=>{
 assert.deepEqual(await complete({planner:true}),{status:'joined',stored:1,snapshots:1,removed:0,extraAuthorization:0});
});
test('returning signed-out user reuses saved offline access when Google omits a refresh token',async()=>{
 assert.deepEqual(await complete({refresh:false,saved:true}),{status:'joined',stored:0,snapshots:1,removed:0,extraAuthorization:0});
});
test('declined free/busy or missing offline access does not join or silently repeat consent',async()=>{
 for(const options of [{permission:false},{refresh:false}]){
  const result=await complete(options);assert.equal(result.status,'permission');assert.equal(result.snapshots,0);assert.equal(result.extraAuthorization,0);assert.equal(result.removed,0);
 }
});
test('header calendar linking saves the connection without joining a meeting or repeating sign-in',async()=>{
 assert.deepEqual(await complete({meeting:false}),{status:'connected',stored:1,snapshots:0,removed:0,extraAuthorization:0});
});

test('returning planner persists newly approved event access without replacing the saved refresh token',async()=>{
 let calls=0,grantedScopes=scope;
 const result=await complete({refresh:false,saved:true,planner:true,eventPermission:true,onScopeSave:async(sub,token,generation,scopes)=>{
  calls++;assert.equal(sub,'google-user');assert.equal(token,'encrypted');
  assert.deepEqual(generation,{version:3,connectionId:'saved-generation'});grantedScopes=scopes;
 }});
 assert.deepEqual(result,{status:'joined',stored:0,snapshots:1,removed:0,extraAuthorization:0});
 assert.equal(calls,1);assert.ok(grantHasFreeBusy(grantedScopes));assert.ok(grantHasEventWrite(grantedScopes));
});
test('a changed saved grant prevents the callback from claiming a successful scope upgrade',async()=>{
 const result=await complete({refresh:false,saved:true,planner:true,eventPermission:true,onScopeSave:async()=>{throw Error('Calendar connection changed.')}});
 assert.equal(result.status,'failed');assert.equal(result.snapshots,0);assert.equal(result.extraAuthorization,0);
});
