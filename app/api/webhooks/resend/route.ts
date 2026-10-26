import {sql,json} from '@/lib/auth';
import {verifiedDeliveryEvent,mayAdvanceDelivery} from '@/lib/delivery-webhook';
export async function POST(req:Request){
 if(!process.env.RESEND_WEBHOOK_SECRET)return json({error:'Webhook unavailable.'},503);
 const raw=await req.text();
 if(raw.length>100000)return json({error:'Request too large.'},413);
 let event;
 try{event=verifiedDeliveryEvent(raw,{'svix-id':req.headers.get('svix-id')||'','svix-timestamp':req.headers.get('svix-timestamp')||'','svix-signature':req.headers.get('svix-signature')||''},process.env.RESEND_WEBHOOK_SECRET)}catch{return json({error:'Invalid signature or event.'},400)}
 if(!event)return json({ok:true});
 try{
  const [row]=await sql()`SELECT id,state,webhook_event_at FROM invitation_outbox WHERE provider='resend' AND (provider_id=${event.emailId} OR (id=${event.jobId} AND (provider_id IS NULL OR provider_id=${event.emailId})))`;
  if(!row)return json({ok:true}); // Ignore authenticated events unrelated to Wharf jobs.
  if(row.webhook_event_at&&new Date(row.webhook_event_at).getTime()>=Date.parse(event.at))return json({ok:true});
  if(!mayAdvanceDelivery(row.state,event.state))return json({ok:true});
  const reason=({bounced:'The recipient mail server rejected this invitation. Check the address.',failed:'The provider reported a failed or suppressed invitation. Check provider logs.',complained:'The recipient marked this invitation as spam. Do not resend.',delayed:'The recipient server delayed delivery. The provider is retrying.'} as Record<string,string>)[event.state]||null;
  const changed=await sql()`UPDATE invitation_outbox SET state=${event.state},provider_id=${event.emailId},sent_at=COALESCE(sent_at,now()),
   delivered_at=CASE WHEN ${event.state}='delivered' THEN ${event.at}::timestamptz ELSE delivered_at END,
   webhook_event_at=${event.at}::timestamptz,last_error=${reason},last_error_code=${event.state},lease_until=NULL
   WHERE id=${row.id} AND state=${row.state} AND (webhook_event_at IS NULL OR webhook_event_at<${event.at}::timestamptz) RETURNING id`;
  if(!changed.length)return json({error:'Delivery state changed concurrently. Replay this event.'},503);
  return json({ok:true});
 }catch{return json({error:'Unable to record delivery event. Retry later.'},503)}
}
