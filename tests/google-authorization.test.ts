import {test} from 'node:test';
import assert from 'node:assert/strict';
import {googleAuthorization,FREE_BUSY_SCOPE} from '../lib/google-authorization.ts';
const eventScope='https://www.googleapis.com/auth/calendar.events.owned';
test('first-time attendee requests identity and offline free/busy together without a forced second consent',()=>{
 const result=googleAuthorization('join','meeting',null);
 assert.equal(result.purpose,'connect');assert.equal(result.calendar,true);
 assert.equal(result.options.access_type,'offline');
 assert.deepEqual(result.options.scope,['openid','profile','email',FREE_BUSY_SCOPE]);
 assert.ok(!('prompt' in result.options));assert.equal(result.options.include_granted_scopes,true);
});
test('linking outside a meeting also connects in one trip, while plain login stays identity-only',()=>{
 const connect=googleAuthorization('connect',null,null);
 assert.equal(connect.purpose,'connect');assert.ok(connect.options.scope.includes(FREE_BUSY_SCOPE));assert.equal(connect.options.access_type,'offline');
 const login=googleAuthorization('join',null,null);
 assert.equal(login.purpose,'join');assert.equal(login.calendar,false);assert.equal(login.options.access_type,'online');assert.deepEqual(login.options.scope,['openid','profile','email']);
});
test('event write access is requested only for planner connection or an explicit organizer upgrade',()=>{
 for(const purpose of ['join','connect'] as const)assert.ok(!googleAuthorization(purpose,'meeting',null).options.scope.includes(eventScope));
 for(const purpose of ['planner_connect','events','agent_events'] as const){
  const result=googleAuthorization(purpose,null,'planner');
  assert.equal(result.purpose,purpose);assert.ok(result.options.scope.includes(eventScope));assert.ok(result.options.scope.includes(FREE_BUSY_SCOPE));
 }
});
test('known missing grants retain account binding and request renewed consent for an offline credential',()=>{
 const result=googleAuthorization('join','meeting','account');
 assert.equal(result.purpose,'connect');assert.equal('prompt' in result.options&&result.options.prompt,'consent');assert.equal('login_hint' in result.options&&result.options.login_hint,'account');assert.equal(result.options.access_type,'offline');
});
