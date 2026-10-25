import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {sealToken,openToken,tokenVaultConfigured} from '../lib/token-vault.ts';
import {needsCalendarConsent,grantHasFreeBusy,revocationComplete} from '../lib/calendar-access.ts';

test('refresh tokens are encrypted, randomized, authenticated and bound to one Google account',()=>{
 const previous=process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
 try{
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY=randomBytes(32).toString('hex');
  const a=sealToken('synthetic-refresh-token','account-a'),b=sealToken('synthetic-refresh-token','account-a');
  assert.notEqual(a,b);assert.ok(!a.includes('synthetic-refresh-token'));assert.equal(openToken(a,'account-a'),'synthetic-refresh-token');
  assert.throws(()=>openToken(a,'account-b'));
  const parts=a.split('.');parts[3]=(parts[3][0]==='A'?'B':'A')+parts[3].slice(1);
  assert.throws(()=>openToken(parts.join('.'),'account-a'));
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY=randomBytes(32).toString('hex');assert.throws(()=>openToken(a,'account-a'));
  delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;assert.equal(tokenVaultConfigured(),false);assert.throws(()=>sealToken('token','account-a'));
 }finally{if(previous===undefined)delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;else process.env.GOOGLE_TOKEN_ENCRYPTION_KEY=previous}
});
test('only authorization failures require fresh consent',()=>{
 assert.equal(needsCalendarConsent({response:{status:400,data:{error:'invalid_grant'}}}),true);
 assert.equal(needsCalendarConsent({response:{status:401}}),true);
 assert.equal(needsCalendarConsent({response:{status:403,data:{error:{errors:[{reason:'insufficientPermissions'}]}}}}),true);
 for(const error of [new Error('network'),{response:{status:429}},{response:{status:500}},{response:{status:403,data:{error:{errors:[{reason:'rateLimitExceeded'}]}}}}])assert.ok(!needsCalendarConsent(error));
});
test('partial consent cannot silently create a calendar connection',()=>{
 assert.equal(grantHasFreeBusy('openid profile'),false);assert.equal(grantHasFreeBusy(undefined),false);
 assert.equal(grantHasFreeBusy('openid https://www.googleapis.com/auth/calendar.freebusy profile'),true);
});
test('disconnect accepts an already revoked token but not a transient failure',()=>{
 assert.ok(revocationComplete(200,{}));assert.ok(revocationComplete(400,{error:'invalid_token'}));
 assert.ok(!revocationComplete(503,{}));assert.ok(!revocationComplete(400,{error:'invalid_request'}));
});
