import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkCalendarStaging} from '../scripts/check-calendar-staging.mjs';
const env={DATABASE_URL:'postgresql://user:fake-password@staging.example.test/neondb?sslmode=require',APP_URL:'http://localhost:3010',GOOGLE_TOKEN_ENCRYPTION_KEY:'a'.repeat(64),MICROSOFT_CLIENT_ID:'1f104508-0140-443d-bcd7-8c1874c2ead6',MICROSOFT_CLIENT_SECRET:'fake-secret',GOOGLE_CLIENT_ID:'fake-google',GOOGLE_CLIENT_SECRET:'fake-google-secret',INVITATION_FROM:'sender@example.test',GMAIL_APP_PASSWORD:'fake-sender-password'};
const target={appUrl:env.APP_URL,databaseHost:'staging.example.test'};
test('offline staging validation returns exact callbacks without exposing credentials or mutating the key',()=>{
 const before={...env};const result=checkCalendarStaging(env,target);
 assert.deepEqual(result.errors,[]);
 assert.deepEqual(result.callbacks,['http://localhost:3010/api/auth/google/callback','http://localhost:3010/api/auth/microsoft/callback']);
 assert.deepEqual(env,before);assert.doesNotMatch(JSON.stringify(result),/fake-password|fake-secret|fake-sender-password/);
});
test('staging check refuses production origins, mismatched targets, insecure databases and malformed keys',()=>{
 for(const changes of [{APP_URL:'https://wharfmeetings.com'},{APP_URL:'https://www.wharfmeetings.com'},{APP_URL:'http://localhost:3010/'},{APP_URL:'http://remote.example.test'},{DATABASE_URL:env.DATABASE_URL.replace('staging.example.test','production.example.test')},{DATABASE_URL:env.DATABASE_URL.replace('sslmode=require','sslmode=disable')},{GOOGLE_TOKEN_ENCRYPTION_KEY:'short'},{MICROSOFT_CLIENT_SECRET:''}]){
  const result=checkCalendarStaging({...env,...changes},target);
  assert.ok(result.errors.length);assert.deepEqual(result.callbacks,[]);
  assert.doesNotMatch(JSON.stringify(result),/fake-password|fake-secret|fake-sender-password/);
 }
});
