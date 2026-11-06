import {conversationUrl} from '../lib/conversation-url.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadWithMocks} from './module-fixture.ts';

for(const fails of [false,true])test(`logout ${fails?'preserves identity for a failed revocation retry':'disconnects both calendar stores before clearing identity'}`,async()=>{
 const calls:string[]=[];
 const db:any=(parts:TemplateStringsArray)=>{calls.push(parts.join(''));return Promise.resolve([])};
 db.transaction=async(queries:Promise<unknown>[])=>Promise.all(queries);
 const {DELETE}=loadWithMocks<{DELETE:(r:Request)=>Promise<Response>}>(new URL('../app/api/auth/account/route.ts',import.meta.url),{
  '@/lib/auth':{sameOrigin:()=>true,session:async()=>({id:'session',google_sub:'account'}),sql:()=>db,json:(data:unknown,status=200)=>Response.json(data,{status})},
  '@/lib/calendar-intent':{beginCalendarIntent:async(_db:unknown,_session:string,_account:string,accountWide?:boolean)=>{assert.notEqual(accountWide,false);return {}},runCalendarIntent:async(_intent:unknown,work:()=>Promise<unknown>)=>work()},
  '@/lib/provider-connections':{disconnectProvider:async()=>{calls.push('disconnect-provider')}},
  '@/lib/calendar-connection':{disconnectCalendar:async()=>{calls.push('disconnect-google');if(fails)throw Error('Revocation unavailable')}},
 });
 const response=await DELETE(new Request('https://wharf.example/api/auth/account',{method:'DELETE'}));
 assert.equal(response.status,fails?503:200);
 assert.deepEqual(calls.slice(0,2),['disconnect-provider','disconnect-google']);
 assert.equal(calls.some(q=>q.includes('UPDATE sessions SET google_sub=NULL')), !fails);
 if(!fails)assert.deepEqual(await response.json(),{user:null,disconnected:true});
});

test('both disconnect endpoints use the logout handler',()=>{
 const handler=async()=>Response.json({user:null,disconnected:true});
 for(const provider of ['google','calendar']){
  const {POST}=loadWithMocks<{POST:typeof handler}>(new URL(`../app/api/auth/${provider}/disconnect/route.ts`,import.meta.url),{'@/app/api/auth/account/route':{DELETE:handler}});
  assert.equal(POST,handler);
 }
});

for(const failure of ['permission','storage'] as const)test(`Google ${failure} failure does not create a signed-in session`,async()=>{
 let signedIn=false;
 const db=async(parts:TemplateStringsArray)=>{
  const query=parts.join('');
  if(query.includes('DELETE FROM oauth_states'))return [{calendar_intent:{},purpose:'connect',nonce:'nonce'}];
  if(query.includes('UPDATE sessions')){signedIn=true;return [{id:'session'}]}
  return [];
 };
 const {GET}=loadWithMocks<{GET:(r:Request)=>Promise<Response>}>(new URL('../app/api/auth/google/callback/route.ts',import.meta.url),{
  '@/lib/calendar-intent':{runCalendarIntent:async(_intent:unknown,work:()=>Promise<unknown>)=>work(),bindCalendarAccount:async()=>{}},
  '@/lib/provider-switch-guard':{isStandaloneProviderAccount:()=>false,captureGoogleSwitch:async()=>({check:async()=>{},remove:async()=>{}})},
  '@/lib/planner-access':{},'next/server':{},'@/lib/slack-workflow':{},'@/lib/conversation-url':{conversationUrl},'@/lib/slack-attendance':{},'@/lib/agent-calendar-authorization':{},'@/lib/google-event-payload':{},
  '@/lib/auth':{session:async()=>({id:'session',google_sub:null}),sql:()=>db,hash:(s:string)=>s,appUrl:()=> 'https://wharf.example'},
  '@/lib/calendar-invitation':{validEmail:()=>true},
  '@/lib/google':{google:()=>({getToken:async()=>({tokens:{id_token:'id',access_token:'access',refresh_token:'refresh',scope:'freebusy'}}),verifyIdToken:async()=>({getPayload:()=>({sub:'account',email_verified:true,email:'person@example.test',nonce:'nonce'})})})},
  '@/lib/google-flow':{},
  '@/lib/calendar-connection':{prepareCalendarConsent:async()=>({}),saveCalendarGrant:async()=>{throw Error('Storage unavailable')}},
  '@/lib/calendar-access':{grantHasFreeBusy:()=>failure!=='permission'},
 });
 const response=await GET(new Request('https://wharf.example/api/auth/google/callback?state=state&code=code'));
 assert.equal(new URL(response.headers.get('location')!).searchParams.get('calendar'),failure==='permission'?'permission':'failed');
 assert.equal(signedIn,false);
});

test('Apple login is unavailable until it connects a calendar',async()=>{
 const {appleLoginAvailable}=await import('../lib/apple-signin.ts');
 assert.equal(appleLoginAvailable(),false);
});
