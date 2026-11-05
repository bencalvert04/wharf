import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {checkAppleConfig} from '../scripts/check-apple-config.mjs';
const privateKey=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({format:'pem',type:'pkcs8'}).toString();
const env={APP_URL:'https://wharf.example',APPLE_CLIENT_ID:'com.wharf.web',APPLE_TEAM_ID:'TEAM123456',APPLE_KEY_ID:'KEY1234567',APPLE_PRIVATE_KEY:privateKey};
test('offline Apple configuration validates key material without claiming calendar access or registration',()=>{
 const result=checkAppleConfig(env,{expectedAppUrl:env.APP_URL});
 assert.deepEqual(result.errors,[]);assert.equal(result.callback,env.APP_URL+'/api/auth/apple/callback');assert.equal(result.calendarReady,false);
 assert.doesNotMatch(JSON.stringify(result),/BEGIN PRIVATE KEY/);
 assert.deepEqual(checkAppleConfig({...env,APPLE_PRIVATE_KEY:privateKey.replace(/\n/g,'\\n')}).errors,[]);
});
test('offline Apple checks reject wrong keys, incomplete registration and mismatched origins without leaking values',()=>{
 const wrong=generateKeyPairSync('ec',{namedCurve:'secp384r1'}).privateKey.export({format:'pem',type:'pkcs8'}).toString();
 for(const patch of [{APPLE_PRIVATE_KEY:'secret-bad-key'},{APPLE_PRIVATE_KEY:wrong},{APPLE_TEAM_ID:''},{APPLE_KEY_ID:'bad'},{APP_URL:'http://localhost:3000'},{APP_URL:'https://wharf.example/'},{APP_URL:'https://user:secret@wharf.example'},{APP_URL:'https://other.example'}]){
  const result=checkAppleConfig({...env,...patch},{expectedAppUrl:env.APP_URL});
  assert.ok(result.errors.length);assert.equal(result.callback,null);assert.doesNotMatch(JSON.stringify(result),/secret-bad-key|BEGIN PRIVATE KEY|user:secret/);
 }
});
