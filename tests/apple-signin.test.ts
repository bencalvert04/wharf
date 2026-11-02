import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportPKCS8,exportJWK,createLocalJWKSet,SignJWT,jwtVerify,type JWTPayload} from 'jose';
import {appleAuthorize,appleClientSecret,verifyAppleIdentity,appleDisplayName} from '../lib/apple-signin.ts';

async function setup(t:any){
 const old={...process.env};t.after(()=>{for(const key of ['APPLE_CLIENT_ID','APPLE_TEAM_ID','APPLE_KEY_ID','APPLE_PRIVATE_KEY','APP_URL']){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key]}});
 const pair=await generateKeyPair('ES256',{extractable:true});
 Object.assign(process.env,{APPLE_CLIENT_ID:'com.wharf.test',APPLE_TEAM_ID:'TESTTEAM01',APPLE_KEY_ID:'TESTKEY001',APPLE_PRIVATE_KEY:await exportPKCS8(pair.privateKey),APP_URL:'https://wharf.example'});
 return pair;
}
test('Apple login redirects exclusively to Apple with state, nonce and identity-only scopes',async t=>{
 await setup(t);const url=new URL(appleAuthorize('random-state','random-nonce'));
 assert.equal(url.origin,'https://appleid.apple.com');assert.equal(url.pathname,'/auth/authorize');assert.equal(url.searchParams.get('scope'),'name email');assert.equal(url.searchParams.get('response_mode'),'form_post');assert.equal(url.searchParams.get('state'),'random-state');assert.equal(url.searchParams.get('nonce'),'random-nonce');assert.equal(url.searchParams.get('redirect_uri'),'https://wharf.example/api/auth/apple/callback');
 process.env.APP_URL='http://localhost:3010';assert.throws(()=>appleAuthorize('s','n'),/registered HTTPS/);
});
test('Apple client authentication uses a short-lived ES256 developer token',async t=>{
 const pair=await setup(t);const token=await appleClientSecret();const {payload,protectedHeader}=await jwtVerify(token,pair.publicKey,{issuer:'TESTTEAM01',audience:'https://appleid.apple.com'});
 assert.equal(payload.sub,'com.wharf.test');assert.equal(protectedHeader.kid,'TESTKEY001');assert.ok(payload.exp!-payload.iat!<=300);
});
test('Apple identity verification rejects wrong signature, issuer, audience, nonce, expiry and unverified email',async t=>{
 await setup(t);const pair=await generateKeyPair('RS256'),other=await generateKeyPair('RS256');
 const jwk=await exportJWK(pair.publicKey);const keys=createLocalJWKSet({keys:[{...jwk,kid:'test'}]});
 const now=Math.floor(Date.now()/1000);
 const base={iss:'https://appleid.apple.com',aud:'com.wharf.test',sub:'stable-identity',iat:now,exp:now+300,nonce:'expected',email:'relay@privaterelay.appleid.com',email_verified:true};
 const sign=(claims:JWTPayload,key=pair.privateKey)=>new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'test'}).sign(key);
 assert.deepEqual(await verifyAppleIdentity(await sign(base),'expected',keys),{account:'apple:stable-identity',email:base.email});
 for(const change of [{iss:'https://evil.example'},{aud:'other-client'},{nonce:'different'},{exp:now-60},{iat:now-3600},{email_verified:false},{sub:''}])await assert.rejects(verifyAppleIdentity(await sign({...base,...change}),'expected',keys));
 await assert.rejects(verifyAppleIdentity(await sign(base,other.privateKey),'expected',keys));
});
test('Apple display names are optional, bounded and never provide account identity',()=>{
 assert.equal(appleDisplayName(null),null);assert.equal(appleDisplayName('{bad'),null);assert.equal(appleDisplayName(JSON.stringify({name:{firstName:'<Ben>',lastName:'Calvert\n'},email:'attacker@example.com'})),'Ben Calvert');assert.equal(appleDisplayName(JSON.stringify({name:{firstName:'a'.repeat(200)}}))?.length,100);
});
