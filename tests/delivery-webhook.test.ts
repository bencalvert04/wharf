import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Webhook} from 'svix';
import {verifiedDeliveryEvent,mayAdvanceDelivery} from '../lib/delivery-webhook.ts';
const secret='whsec_'+Buffer.alloc(32,7).toString('base64');
function signed(type='email.delivered',at=new Date()){
 const body=JSON.stringify({type,created_at:at.toISOString(),data:{email_id:'provider-123',tags:{invitation_id:'job-123'}}});
 const headers={'svix-id':'msg-test','svix-timestamp':String(Math.floor(at.getTime()/1000)),'svix-signature':new Webhook(secret).sign('msg-test',at,body)};
 return {body,headers};
}
test('authenticates raw provider events and correlates the immutable job tag',()=>{
 const {body,headers}=signed();const event=verifiedDeliveryEvent(body,headers,secret);
 assert.equal(event?.state,'delivered');assert.equal(event?.emailId,'provider-123');assert.equal(event?.jobId,'job-123');
});
test('tampered, unsigned, or stale webhooks are rejected',()=>{
 const {body,headers}=signed();
 assert.throws(()=>verifiedDeliveryEvent(body+' ',headers,secret));
 assert.throws(()=>verifiedDeliveryEvent(body,{...headers,'svix-signature':''},secret));
 const old=signed('email.delivered',new Date(Date.now()-3600000));assert.throws(()=>verifiedDeliveryEvent(old.body,old.headers,secret));
});
test('irrelevant signed events do not mutate invitation delivery',()=>{
 const event=signed('email.opened');assert.equal(verifiedDeliveryEvent(event.body,event.headers,secret),null);
});
test('late sent events cannot overwrite delivered, bounced, or complained states',()=>{
 for(const state of ['delivered','bounced','failed','complained'] as const)assert.equal(mayAdvanceDelivery(state,'accepted'),false);
 assert.equal(mayAdvanceDelivery('accepted','delivered'),true);
 assert.equal(mayAdvanceDelivery('delivered','bounced'),true);
 assert.equal(mayAdvanceDelivery('bounced','delivered'),false);
});
