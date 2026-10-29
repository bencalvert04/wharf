import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGoogleLogin,watchGoogleLoginNavigation} from '../lib/google-login.ts';

function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function setup(){
 let location='https://wharfmeetings.com/?meeting=original',pending=false,error='';
 const requests:{init:RequestInit;response:ReturnType<typeof deferred<Response>>}[]=[],redirects:string[]=[];
 const login=createGoogleLogin({
  fetch:async(input,init)=>{assert.equal(input,'/api/auth/google/start');const response=deferred<Response>();requests.push({init:init!,response});return response.promise},
  location:()=>location,redirect:url=>{redirects.push(url)},setPending:value=>{pending=value},setError:value=>{error=value},
 });
 const target=new EventTarget(),stop=watchGoogleLoginNavigation(login,target);
 return {login,requests,redirects,target,stop,location:(value:string)=>{location=value},pending:()=>pending,error:()=>error};
}
const success=()=>Response.json({url:'https://accounts.google.com/authorize?state=test'});

test('normal login retains the meeting return target and ignores repeated clicks until navigation',async()=>{
 const state=setup(),first=state.login.start(),duplicate=state.login.start();
 assert.equal(state.pending(),true);assert.equal(state.requests.length,1);
 assert.equal(state.requests[0].init.method,'POST');
 assert.deepEqual(JSON.parse(state.requests[0].init.body as string),{returnMeetingId:'original'});
 state.requests[0].response.resolve(success());await Promise.all([first,duplicate]);
 assert.deepEqual(state.redirects,['https://accounts.google.com/authorize?state=test']);
 assert.equal(state.pending(),true);await state.login.start();assert.equal(state.requests.length,1);
 state.stop();state.login.dispose();
});

test('Back and Forward page restoration clears Signing in and permits a fresh login',async()=>{
 const state=setup(),first=state.login.start();state.requests[0].response.resolve(success());await first;
 state.target.dispatchEvent(new Event('pagehide'));
 assert.equal(state.pending(),false);assert.equal(state.requests[0].init.signal?.aborted,true);
 for(const event of ['pageshow','popstate'])state.target.dispatchEvent(new Event(event));
 const second=state.login.start();assert.equal(state.requests.length,2);
 state.requests[1].response.resolve(success());await second;assert.equal(state.redirects.length,2);
 state.target.dispatchEvent(new Event('pageshow'));assert.equal(state.pending(),false);
 state.stop();state.login.dispose();
});

for(const event of ['pagehide','pageshow','popstate','hashchange'])test(`${event} cancels a pending request and ignores its late redirect`,async()=>{
 const state=setup(),first=state.login.start();
 state.target.dispatchEvent(new Event(event));assert.equal(state.pending(),false);assert.equal(state.requests[0].init.signal?.aborted,true);
 const second=state.login.start();assert.equal(state.pending(),true);
 state.requests[0].response.resolve(success());await first;
 assert.deepEqual(state.redirects,[]);assert.equal(state.pending(),true);
 state.requests[1].response.resolve(success());await second;assert.equal(state.redirects.length,1);
 state.stop();state.login.dispose();
});

test('an interrupted redirect can be retried on focus, but focus does not cancel an in-flight start request',async()=>{
 const state=setup(),first=state.login.start();state.target.dispatchEvent(new Event('focus'));assert.equal(state.pending(),true);
 state.requests[0].response.resolve(success());await first;state.target.dispatchEvent(new Event('focus'));assert.equal(state.pending(),false);
 state.stop();state.login.dispose();
});

test('a newer in-app view cancels login, and a changed URL independently prevents a late redirect',async()=>{
 const state=setup(),first=state.login.start();
 state.login.cancel();assert.equal(state.pending(),false);
 state.requests[0].response.resolve(success());await first;assert.deepEqual(state.redirects,[]);
 const second=state.login.start();state.location('https://wharfmeetings.com/?view=pending');
 state.requests[1].response.resolve(success());await second;assert.deepEqual(state.redirects,[]);assert.equal(state.pending(),false);
 state.stop();state.login.dispose();
});

test('request failures and invalid responses restore the login button and allow a retry',async()=>{
 const state=setup();
 for(const result of [new Error('Network unavailable'),Response.json({error:'Google is unavailable'},{status:503}),Response.json({})]){
  const attempt=state.login.start(),request=state.requests.at(-1)!;
  if(result instanceof Error)request.response.reject(result);else request.response.resolve(result);
  await attempt;assert.equal(state.pending(),false);assert.ok(state.error());assert.deepEqual(state.redirects,[]);
 }
 const retry=state.login.start();assert.equal(state.error(),'');state.requests.at(-1)!.response.resolve(success());await retry;assert.equal(state.redirects.length,1);
 state.stop();state.login.dispose();
});

test('late failures cannot clear a newer attempt and unmount prevents state updates or redirects',async()=>{
 const state=setup(),first=state.login.start();state.login.cancel();const second=state.login.start();
 state.requests[0].response.reject(new Error('Late failure'));await first;assert.equal(state.pending(),true);assert.equal(state.error(),'');
 state.stop();state.login.dispose();assert.equal(state.requests[1].init.signal?.aborted,true);
 state.requests[1].response.resolve(success());await second;assert.deepEqual(state.redirects,[]);
 // dispose deliberately avoids setState after unmount.
 assert.equal(state.pending(),true);await state.login.start();assert.equal(state.requests.length,2);
});
