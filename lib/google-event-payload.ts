import {createHash} from 'node:crypto';
export const EVENT_SCOPE='https://www.googleapis.com/auth/calendar.events.owned';
export function grantHasEventWrite(scope:string|undefined){return !!scope?.split(/\s+/).some(s=>[EVENT_SCOPE,'https://www.googleapis.com/auth/calendar.events','https://www.googleapis.com/auth/calendar'].includes(s))}
export function googleEventPayload(input:{id:string;title:string;start:number;end:number;zone:string;organizerSub:string;organizerEmail:string;attendees:{email:string;name:string}[];url:string}){
 const id=createHash('sha256').update('wharf-event:'+input.id+':'+input.organizerSub).digest('hex');
 const attendees=[...new Map(input.attendees.filter(p=>p.email.toLowerCase()!==input.organizerEmail.toLowerCase()).map(p=>[p.email.toLowerCase(),{email:p.email,displayName:p.name}])).values()];
 return {id,summary:input.title,description:'Scheduled with Wharf. '+input.url,
  start:{dateTime:new Date(input.start).toISOString(),timeZone:input.zone},end:{dateTime:new Date(input.end).toISOString(),timeZone:input.zone},
  attendees,guestsCanModify:false,guestsCanInviteOthers:false,
  extendedProperties:{private:{wharfMeetingId:input.id}}};
}
export type GoogleEventPayload=ReturnType<typeof googleEventPayload>;
export type EventResult={id?:string;status?:string;htmlLink?:string;extendedProperties?:{private?:{wharfMeetingId?:string}}};
export type EventTransport={request:(options:{url:string;method:'GET'|'POST';data?:GoogleEventPayload;params?:{sendUpdates:string};timeout:number})=>Promise<{data:unknown}>};
function status(error:unknown){return (error as {response?:{status?:number}})?.response?.status}
/** A stable provider ID recovers a successful insert even if its response was lost. */
export async function createOrRecoverGoogleEvent(client:EventTransport,payload:GoogleEventPayload){
 const base='https://www.googleapis.com/calendar/v3/calendars/primary/events';
 const read=()=>client.request({url:base+'/'+payload.id,method:'GET',timeout:15000});
 const verify=(data:unknown)=>{const event=data as EventResult;if(event.id!==payload.id||event.status==='cancelled'||event.extendedProperties?.private?.wharfMeetingId!==payload.extendedProperties.private.wharfMeetingId)throw Error('The Google Calendar event changed or was removed. Check your calendar before retrying.');return event};
 try{return verify((await read()).data)}catch(error){if(status(error)!==404)throw error}
 try{return verify((await client.request({url:base,method:'POST',data:payload,params:{sendUpdates:'all'},timeout:15000})).data)}catch(error){if(status(error)!==409)throw error;return verify((await read()).data)}
}
