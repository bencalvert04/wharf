import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {calendarIntentSchema} from '../db/calendar-intent-schema.mjs';
import {appleSigninSchema} from '../db/apple-signin-schema.mjs';
import * as intent from '../lib/calendar-intent.ts';
import {appleDisplayName} from '../lib/apple-signin.ts';
import {loadWithMocks} from './module-fixture.ts';

async function fixture(){
 const database=new PGlite();
 await database.exec(`CREATE TABLE sessions(id text PRIMARY KEY,google_sub text,name text,email text,picture text,expires_at timestamptz);CREATE TABLE oauth_states(id text);CREATE TABLE calendar_provider_states(id text);INSERT INTO sessions(id,expires_at) VALUES('session',now()+interval '1 day');`);
 for(const statement of [...calendarIntentSchema,...appleSigninSchema])await database.exec(statement);
 const raw=Symbol('query');const query=(text:string,values:unknown[]=[])=>({[raw]:{text,values},then:(resolve:any,reject:any)=>database.query(text,values).then(r=>r.rows).then(resolve,reject)});
 const db:any=(parts:TemplateStringsArray,...values:unknown[])=>query(parts.reduce((out,part,index)=>out+(index?'$'+index:'')+part,''),values);
 db.query=query;db.transaction=(queries:any[])=>database.transaction(async tx=>{const results=[];for(const q of queries){const {text,values}=q[raw];results.push((await tx.query(text,values)).rows)}return results});
 const cookies=new Map<string,string>(),cookieOptions:any[]=[];let exchanges=0,configured=true,interleave=async()=>{};
 const common={
  'next/headers':{cookies:async()=>({get:(k:string)=>cookies.has(k)?{value:cookies.get(k)}:undefined,set:(k:string,v:string,o:any)=>{cookies.set(k,v);cookieOptions.push(o)}})},
  '@/lib/calendar-intent':intent,
  '@/lib/auth':{sameOrigin:(r:Request)=>r.headers.get('origin')==='https://wharf.example',json:(data:unknown,status=200)=>Response.json(data,{status}),session:async()=> (await database.query("SELECT * FROM sessions WHERE id='session'")).rows[0],sql:()=>intent.guardCalendarDatabase(db),hash:(v:string)=>createHash('sha256').update(v).digest('hex'),token:()=>randomBytes(32).toString('base64url'),appUrl:()=> 'https://wharf.example'},
  '@/lib/apple-signin':{appleLoginAvailable:()=>configured,appleDisplayName,appleAuthorize:(state:string,nonce:string)=>'https://appleid.apple.com/auth/authorize?'+new URLSearchParams({state,nonce}),exchangeAppleCode:async()=>{exchanges++;await interleave();return {account:'apple:person',email:'verified@example.test'}}},
 };
 const start=loadWithMocks<{POST:Function}>(new URL('../app/api/auth/apple/start/route.ts',import.meta.url),common).POST;
 const callback=loadWithMocks<{POST:Function}>(new URL('../app/api/auth/apple/callback/route.ts',import.meta.url),common).POST;
 const begin=()=>start(new Request('https://wharf.example/api/auth/apple/start',{method:'POST',headers:{origin:'https://wharf.example'},body:JSON.stringify({returnMeetingId:'meeting'})}));
 const complete=(state:string,error?:string)=>callback(new Request('https://wharf.example/api/auth/apple/callback',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({state,...(error?{error}:{code:'code',user:JSON.stringify({name:{firstName:'Ben'},email:'untrusted@example.test'})})})}));
 return {database,db,cookies,cookieOptions,begin,complete,start,get exchanges(){return exchanges},disable:()=>{configured=false},interleave:(fn:()=>Promise<void>)=>{interleave=fn}};
}
const result=(response:Response)=>new URL(response.headers.get('location')!).searchParams;
test('official Apple callback signs in without a normal session cookie or calendar grant and cannot replay',async()=>{
 const f=await fixture();try{
  const response=await f.begin();assert.equal(response.status,200);const state=new URL((await response.json()).url).searchParams.get('state')!;
  assert.deepEqual(f.cookieOptions[0],{httpOnly:true,secure:true,sameSite:'none',path:'/',maxAge:600});
  const done=await f.complete(state);assert.equal(result(done).get('signin'),'apple');assert.equal(result(done).get('meeting'),'meeting');
  assert.deepEqual((await f.database.query('SELECT google_sub,name,email FROM sessions')).rows,[{google_sub:'apple:person',name:'Ben',email:'verified@example.test'}]);
  assert.equal(result(await f.complete(state)).get('signin'),'expired');assert.equal(f.exchanges,1);
  assert.equal((await f.database.query('SELECT * FROM apple_signin_states')).rows.length,0);
 }finally{await f.database.close()}
});
test('Apple callback rejects stolen state without browser binding and handles denial without authenticating',async()=>{
 const f=await fixture();try{
  const state=new URL((await (await f.begin()).json()).url).searchParams.get('state')!;const binding=f.cookies.get('__Host-wharf_apple')!;
  f.cookies.set('__Host-wharf_apple','different-browser');assert.equal(result(await f.complete(state)).get('signin'),'expired');assert.equal(f.exchanges,0);
  f.cookies.set('__Host-wharf_apple',binding);assert.equal(result(await f.complete(state,'user_cancelled_authorize')).get('signin'),'cancelled');assert.equal(f.exchanges,0);
  assert.equal((await f.database.query<{google_sub:string|null}>('SELECT google_sub FROM sessions')).rows[0].google_sub,null);
 }finally{await f.database.close()}
});
test('sign-out or a newer provider action during Apple token exchange prevents late login',async()=>{
 const f=await fixture();try{
  const state=new URL((await (await f.begin()).json()).url).searchParams.get('state')!;
  f.interleave(async()=>{await intent.beginCalendarIntent(f.db,'session',null,false)});
  assert.equal(result(await f.complete(state)).get('signin'),'failed');assert.equal((await f.database.query<{google_sub:string|null}>('SELECT google_sub FROM sessions')).rows[0].google_sub,null);assert.equal((await f.database.query('SELECT * FROM apple_accounts')).rows.length,0);
 }finally{await f.database.close()}
});
test('Apple start rejects cross-origin requests, missing configuration and account linking',async()=>{
 const f=await fixture();try{
  assert.equal((await f.start(new Request('https://wharf.example/api/auth/apple/start',{method:'POST',body:'{}'}))).status,403);
  await f.database.exec("UPDATE sessions SET google_sub='google-person'");assert.equal((await f.begin()).status,409);
  f.disable();assert.equal((await f.begin()).status,503);assert.equal(f.cookies.size,0);
 }finally{await f.database.close()}
});
test('Apple callbacks expire and a second tab supersedes the first authorization',async()=>{
 const f=await fixture();try{
  const first=new URL((await (await f.begin()).json()).url).searchParams.get('state')!;
  const second=new URL((await (await f.begin()).json()).url).searchParams.get('state')!;
  assert.equal(result(await f.complete(first)).get('signin'),'expired');
  await f.database.exec("UPDATE apple_signin_states SET expires_at=now()-interval '1 minute'");
  assert.equal(result(await f.complete(second)).get('signin'),'expired');assert.equal(f.exchanges,0);
 }finally{await f.database.close()}
});
test('Apple identity is reported as signed in without claiming a calendar connection',async()=>{
 const {GET}=loadWithMocks<{GET:()=>Promise<Response>}>(new URL('../app/api/auth/account/route.ts',import.meta.url),{
  '@/lib/calendar-intent':{},
  '@/lib/auth':{session:async()=>({google_sub:'apple:person',name:'Ben'}),json:(data:unknown,status=200)=>Response.json(data,{status})},
  '@/lib/provider-connections':{providerConnection:async()=>null},
  '@/lib/calendar-connection':{calendarConnection:async()=>null},
 });
 const body=await (await GET()).json();assert.equal(body.user.name,'Ben');assert.equal(body.user.calendarConnected,false);assert.equal(body.user.calendarProvider,null);
});
