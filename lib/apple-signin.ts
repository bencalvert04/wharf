import {createRemoteJWKSet,importPKCS8,SignJWT,jwtVerify,type JWTVerifyGetKey} from 'jose';

const issuer='https://appleid.apple.com';
const keys=createRemoteJWKSet(new URL(issuer+'/auth/keys'),{timeoutDuration:10000});
export const appleConfigured=()=>!!(process.env.APPLE_CLIENT_ID&&process.env.APPLE_TEAM_ID&&process.env.APPLE_KEY_ID&&process.env.APPLE_PRIVATE_KEY);
export function appleRedirect(){
 const origin=new URL(process.env.APP_URL||'');
 if(origin.protocol!=='https:'||origin.hostname==='localhost'||origin.username||origin.password||origin.origin!==process.env.APP_URL)throw Error('Apple sign-in requires a registered HTTPS origin.');
 return origin.origin+'/api/auth/apple/callback';
}
export function appleAuthorize(state:string,nonce:string){
 if(!appleConfigured())throw Error('Sign in with Apple is not configured.');
 return issuer+'/auth/authorize?'+new URLSearchParams({client_id:process.env.APPLE_CLIENT_ID!,redirect_uri:appleRedirect(),response_type:'code',response_mode:'form_post',scope:'name email',state,nonce});
}
export async function appleClientSecret(){
 if(!appleConfigured())throw Error('Sign in with Apple is not configured.');
 const key=await importPKCS8(process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g,'\n'),'ES256');
 return new SignJWT({}).setProtectedHeader({alg:'ES256',kid:process.env.APPLE_KEY_ID!}).setIssuer(process.env.APPLE_TEAM_ID!).setSubject(process.env.APPLE_CLIENT_ID!).setAudience(issuer).setIssuedAt().setExpirationTime('5m').sign(key);
}
export async function verifyAppleIdentity(idToken:string,nonce:string,getKey:JWTVerifyGetKey=keys){
 const {payload}=await jwtVerify(idToken,getKey,{issuer,audience:process.env.APPLE_CLIENT_ID!,algorithms:['RS256'],requiredClaims:['sub','exp','iat','nonce'],maxTokenAge:'10m',clockTolerance:5});
 if(payload.nonce!==nonce||!payload.sub||payload.sub.length>255)throw Error('Invalid Apple identity.');
 if(typeof payload.email!=='string'||payload.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)||![true,'true'].includes(payload.email_verified as boolean|string))throw Error('Apple did not verify an email address.');
 return {account:'apple:'+payload.sub,email:payload.email};
}
export async function exchangeAppleCode(code:string,nonce:string){
 const response=await fetch(issuer+'/auth/token',{method:'POST',body:new URLSearchParams({client_id:process.env.APPLE_CLIENT_ID!,client_secret:await appleClientSecret(),code,grant_type:'authorization_code',redirect_uri:appleRedirect()}),signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'error'});
 const data=await response.json();
 if(!response.ok||typeof data.id_token!=='string')throw Error('Apple sign-in could not be verified.');
 // Tokens authenticate the identity only. They are never treated as calendar grants.
 return verifyAppleIdentity(data.id_token,nonce);
}
export function appleDisplayName(user:string|null){
 try{
  const name=JSON.parse(user||'{}').name;
  return [name?.firstName,name?.lastName].filter(v=>typeof v==='string').join(' ').replace(/[<>\x00-\x1f\x7f]/g,'').trim().slice(0,100)||null;
 }catch{return null;}
}
