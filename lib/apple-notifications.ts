import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from 'jose';
import {createHash} from 'node:crypto';
import type {CalendarDatabase} from './calendar-connection-store.ts';
const issuer='https://appleid.apple.com';
const keys=createRemoteJWKSet(new URL(issuer+'/auth/keys'),{timeoutDuration:10000});
export type AppleNotification={id:string;account:string;type:'consent-revoked'|'account-deleted'|'email-enabled'|'email-disabled';eventTime:number;email?:string};
export async function verifyAppleNotification(token:string,audience:string,getKey:JWTVerifyGetKey=keys):Promise<AppleNotification>{
 if(!audience.trim()||token.length>16000)throw Error('Invalid Apple notification.');
 // Apple's notification examples have iat/jti but no exp. Permit delivery retries
 // for seven days; durable event IDs additionally prevent replay after re-login.
 const {payload}=await jwtVerify(token,getKey,{issuer,audience,algorithms:['RS256'],requiredClaims:['iat','jti','events'],maxTokenAge:'7d',clockTolerance:300});
 const event=typeof payload.events==='string'?JSON.parse(payload.events):payload.events;
 if(typeof payload.jti!=='string'||!payload.jti||payload.jti.length>255||!event||typeof event!=='object')throw Error('Invalid Apple notification.');
 const e=event as Record<string,unknown>;
 if(typeof e.type!=='string'||!['consent-revoked','account-deleted','email-enabled','email-disabled'].includes(e.type))throw Error('Unsupported Apple notification.');
 if(typeof e.sub!=='string'||!e.sub||e.sub.length>255||!Number.isSafeInteger(e.event_time)||Number(e.event_time)<=0||Number(e.event_time)>payload.iat!+300)throw Error('Invalid Apple notification.');
 if(e.type.startsWith('email-')&&(typeof e.email!=='string'||!/^[-a-zA-Z0-9.!#$%&'*+/=?^_`{|}~]+@privaterelay\.appleid\.com$/i.test(e.email)||e.email.length>254))throw Error('Invalid Apple relay notification.');
 return {email:typeof e.email==='string'?e.email.toLowerCase():undefined,id:createHash('sha256').update(payload.jti).digest('hex'),account:'apple:'+e.sub,type:e.type as AppleNotification['type'],eventTime:Number(e.event_time)};
}
export async function applyAppleNotification(db:CalendarDatabase,event:AppleNotification){
 const [result]=await db`SELECT wharf_apply_apple_notification(${event.id},${event.account},${event.type},${event.eventTime},${event.email||null}) AS applied`;
 return Boolean(result.applied);
}

export async function appleRelayEmailEnabled(db:CalendarDatabase,email:string){
 if(!email.toLowerCase().endsWith('@privaterelay.appleid.com'))return true;
 const key=createHash('sha256').update(email.toLowerCase()).digest('hex');
 const [row]=await db`SELECT enabled FROM apple_email_preferences WHERE email_hash=${key}`;
 return row?.enabled!==false;
}
