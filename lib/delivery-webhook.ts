import {Webhook} from 'svix';
import {webhookState,type DeliveryState} from './delivery-policy.ts';
export type DeliveryEvent={id:string;emailId:string;jobId:string|null;state:DeliveryState;at:string};
export function verifiedDeliveryEvent(body:string,headers:Record<string,string>,secret:string):DeliveryEvent|null{
 new Webhook(secret).verify(body,headers);
 const event=JSON.parse(body) as {type:string;created_at:string;data?:{email_id?:string;tags?:Record<string,string>}};
 const state=webhookState(event.type);
 if(!state)return null;
 if(typeof event.data?.email_id!=='string'||!Number.isFinite(Date.parse(event.created_at)))throw Error('Invalid delivery event');
 const tag=event.data.tags?.invitation_id;
 return {id:headers['svix-id'],emailId:event.data.email_id,jobId:tag&&/^[a-zA-Z0-9-]+$/.test(tag)?tag:null,state,at:event.created_at};
}
export function mayAdvanceDelivery(current:DeliveryState,next:DeliveryState){
 if(current==='complained')return next==='complained';
 if(['bounced','failed'].includes(current))return ['bounced','failed','complained'].includes(next);
 if(current==='delivered')return !['accepted','delayed'].includes(next);
 if(current==='delayed')return next!=='accepted';
 return true;
}
