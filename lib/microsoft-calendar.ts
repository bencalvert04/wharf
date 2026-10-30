const appUrl=()=>process.env.APP_URL||'http://localhost:3000';
import {allowed,type Constraints} from './availability.ts';
import {clipProviderBusy,microsoftBusy} from './provider-busy.ts';
export const microsoftConfigured=()=>!!(process.env.MICROSOFT_CLIENT_ID&&process.env.MICROSOFT_CLIENT_SECRET);
const endpoint='https://login.microsoftonline.com/common/oauth2/v2.0';
const scope='openid profile email offline_access User.Read Calendars.ReadBasic';
export const microsoftRedirect=()=>appUrl()+'/api/auth/microsoft/callback';
export function microsoftAuthorize(state:string,challenge:string){
 return endpoint+'/authorize?'+new URLSearchParams({client_id:process.env.MICROSOFT_CLIENT_ID!,response_type:'code',redirect_uri:microsoftRedirect(),response_mode:'query',scope,state,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account'});
}
export async function microsoftTokens(input:Record<string,string>){
 if(!microsoftConfigured())throw Error('Microsoft Calendar setup is incomplete.');
 const response=await fetch(endpoint+'/token',{method:'POST',body:new URLSearchParams({client_id:process.env.MICROSOFT_CLIENT_ID!,client_secret:process.env.MICROSOFT_CLIENT_SECRET!,scope,...input}),signal:AbortSignal.timeout(15000),cache:'no-store'});
 const data=await response.json();
 if(!response.ok||!data.access_token)throw Error('Microsoft authorization failed. Reconnect your calendar.');
 return data as {access_token:string;refresh_token?:string;scope:string};
}
export async function microsoftProfile(accessToken:string){
 const response=await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',{headers:{Authorization:'Bearer '+accessToken},signal:AbortSignal.timeout(10000),cache:'no-store'});
 if(!response.ok)throw Error('Microsoft account could not be verified.');
 const profile=await response.json();if(typeof profile.id!=='string'||!profile.id)throw Error('Invalid Microsoft account.');
 return {id:profile.id,name:profile.displayName as string,email:(profile.mail||profile.userPrincipalName) as string};
}
export function graphCalendarUrl(value:string){
 const url=new URL(value);
 if(url.origin!=='https://graph.microsoft.com'||!url.pathname.startsWith('/v1.0/me/calendarView'))throw Error('Invalid Microsoft calendar page.');
 return url.href;
}
export async function microsoftAvailability(accessToken:string,c:Constraints){
 const bounds=allowed(c);if(!bounds.length)throw Error('No meeting dates.');
 let url='https://graph.microsoft.com/v1.0/me/calendarView?'+new URLSearchParams({startDateTime:new Date(bounds[0].start).toISOString(),endDateTime:new Date(bounds.at(-1)!.end).toISOString(),'$select':'start,end,showAs,isCancelled','$top':'1000'});
 const busy=[];
 for(let page=0;url;page++){
  if(page>=100)throw Error('Calendar has too many results. Please use a smaller meeting range.');
  const response=await fetch(graphCalendarUrl(url),{headers:{Authorization:'Bearer '+accessToken,Prefer:'outlook.timezone="UTC"'},signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'error'});
  if(!response.ok)throw Error('Microsoft Calendar is unavailable. Reconnect or try again.');
  const data=await response.json();busy.push(...microsoftBusy(data.value));
  if(data['@odata.nextLink']!==undefined&&typeof data['@odata.nextLink']!=='string')throw Error('Invalid calendar response.');
  url=data['@odata.nextLink']||'';
 }
 return clipProviderBusy(busy,c);
}
