import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OAuth2Client,CodeChallengeMethod} from 'google-auth-library';
import {withCalendarDeadline,CalendarDeadlineError} from '../lib/calendar-deadline.ts';
import {loadWithMocks} from './module-fixture.ts';
import {microsoftTokens} from '../lib/microsoft-calendar.ts';
import {appleCalendarFetch} from '../lib/icloud-calendar.ts';

test('Google token exchange shares the deadline and aborts before freeBusy',async()=>{
 const {google}=loadWithMocks<any>(new URL('../lib/google.ts',import.meta.url),{
  'google-auth-library':{OAuth2Client,CodeChallengeMethod},'./auth':{appUrl:()=> 'https://example.test'},'./calendar-data':{},
 });
 let calls=0,aborted=false;
 await assert.rejects(withCalendarDeadline(async signal=>{
  const client=google(signal);client.setCredentials({refresh_token:'test-token'});
  client.transporter.defaults.adapter=async(options:any)=>{
   calls++;assert.match(String(options.url),/token/);assert.equal(options.timeout,15000);
   return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(options.signal.reason)},{once:true}));
  };
  await client.request({url:'https://www.googleapis.com/calendar/v3/freeBusy',method:'POST',timeout:15000});
 },50),CalendarDeadlineError);
 assert.equal(calls,1);assert.equal(aborted,true);
});

test('Microsoft token and iCloud requests inherit cancellation',async()=>{
 const original=globalThis.fetch;
 const oldId=process.env.MICROSOFT_CLIENT_ID,oldSecret=process.env.MICROSOFT_CLIENT_SECRET;
 process.env.MICROSOFT_CLIENT_ID='test';process.env.MICROSOFT_CLIENT_SECRET='test';
 let aborted=0;
 globalThis.fetch=async(_input,init)=>new Promise((_resolve,reject)=>{
  init!.signal!.addEventListener('abort',()=>{aborted++;reject(init!.signal!.reason)},{once:true});
 });
 try{
  await assert.rejects(withCalendarDeadline(signal=>microsoftTokens({refresh_token:'test'},signal),30),CalendarDeadlineError);
  await assert.rejects(withCalendarDeadline(signal=>appleCalendarFetch('https://caldav.icloud.com/',{signal}),30),CalendarDeadlineError);
  assert.equal(aborted,2);
 }finally{globalThis.fetch=original;if(oldId===undefined)delete process.env.MICROSOFT_CLIENT_ID;else process.env.MICROSOFT_CLIENT_ID=oldId;if(oldSecret===undefined)delete process.env.MICROSOFT_CLIENT_SECRET;else process.env.MICROSOFT_CLIENT_SECRET=oldSecret;}
});
