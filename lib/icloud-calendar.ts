import {DAVClient} from 'tsdav';
import {allowed,type Constraints} from './availability.ts';
import {icloudBusy} from './provider-busy.ts';
// Discovery URLs come from Apple's responses, never from the user. Check every
// request and redirect before sending an Authorization header.
export function appleCalendarUrl(value:string){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.port||url.username||url.password||!(url.hostname==='caldav.icloud.com'||/^p\d+-caldav\.icloud\.com$/.test(url.hostname)))throw Error('Invalid Apple calendar endpoint.');
 return url.href;
}
export const appleCalendarFetch:typeof fetch=async(input,init)=>{
 let url=appleCalendarUrl(String(input));
 const method=init?.method?.toUpperCase()||'GET';
 if(!['GET','HEAD','OPTIONS','PROPFIND','REPORT'].includes(method))throw Error('Calendar writes are not supported.');
 for(let redirects=0;redirects<5;redirects++){
  const response=await fetch(url,{...init,redirect:'manual',signal:AbortSignal.timeout(15000),cache:'no-store'});
  if([301,302,307,308].includes(response.status)){
   const location=response.headers.get('location');if(!location)throw Error('Invalid Apple redirect.');
   url=appleCalendarUrl(new URL(location,url).href);continue;
  }
  if(!response.ok)throw Error('Could not read iCloud Calendar. Check your Apple Account and app-specific password.');
  return response;
 }
 throw Error('Too many Apple calendar redirects.');
};
export type AppleCredential={username:string;password:string};
export async function icloudClient(credential:AppleCredential){
 const client=new DAVClient({serverUrl:'https://caldav.icloud.com',credentials:credential,authMethod:'Basic',defaultAccountType:'caldav',fetch:appleCalendarFetch});
 await client.login();return client;
}
export async function icloudAvailability(credential:AppleCredential,c:Constraints){
 const client=await icloudClient(credential),calendars=await client.fetchCalendars();
 if(!calendars.some(c=>!c.components?.length||c.components.includes('VEVENT')))throw Error('No iCloud event calendars were found.');
 const bounds=allowed(c);if(!bounds.length)throw Error('No meeting dates.');
 const busy=[];
 // Query all accessible event calendars; never silently ignore a failed calendar.
 for(const calendar of calendars){
  if(calendar.components?.length&&!calendar.components.includes('VEVENT'))continue;
  appleCalendarUrl(calendar.url);
  const objects=await client.fetchCalendarObjects({calendar,timeRange:{start:new Date(bounds[0].start).toISOString(),end:new Date(bounds.at(-1)!.end).toISOString()},expand:true,useMultiGet:false,urlFilter:url=>new URL(url).pathname!==new URL(calendar.url).pathname});
  const timezone=calendar.timezone?.match(/(?:^|\r?\n)TZID:([^\r\n]+)/)?.[1]||c.zone;
  try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format()}catch{throw Error('Unsupported iCloud calendar timezone.');}
  busy.push(...await icloudBusy(objects,c,timezone));
 }
 return busy;
}
