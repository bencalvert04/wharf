export type DeliveryState='queued'|'sending'|'retry'|'accepted'|'delivered'|'delayed'|'bounced'|'failed'|'complained'|'review';
export type SendFailure={state:'retry'|'failed'|'review';code:string;reason:string};
export const MAX_ATTEMPTS=8;
export const IDEMPOTENCY_WINDOW_MS=23*60*60*1000;
export function retryDelay(attempt:number){return Math.min(60*60*1000,60*1000*2**Math.max(0,attempt-1))}
export function classifySmtpFailure(error:unknown):SendFailure{
 const e=error as {code?:string;responseCode?:number;command?:string};
 if(e?.responseCode&&e.responseCode>=400&&e.responseCode<500)return {state:'retry',code:'smtp_temporary',reason:'The mail server temporarily rejected the send. Wharf will retry.'};
 if(e?.code==='EAUTH')return {state:'failed',code:'sender_auth',reason:'The sender credential was rejected. The Wharf administrator must repair email setup.'};
 if(e?.responseCode&&e.responseCode>=500)return {state:'failed',code:'smtp_rejected',reason:'The mail server rejected the invitation. Check the recipient address and sender setup.'};
 if(['CONN','EHLO','HELO','STARTTLS','AUTH PLAIN','AUTH LOGIN'].includes(e?.command||'')||e?.code==='EDNS')return {state:'retry',code:'smtp_connect',reason:'The connection failed before message submission. Wharf will retry.'};
 return {state:'review',code:'smtp_uncertain',reason:'The connection ended without confirming submission. An administrator must check the sender’s delivery logs before resending.'};
}
export function classifyResendFailure(status:number,name=''):SendFailure{
 if(status===429||status>=500||status===0||name==='concurrent_idempotent_requests')return {state:'retry',code:'provider_temporary',reason:'The email provider is temporarily unavailable. Wharf will retry with the same request key.'};
 if(status===409)return {state:'review',code:'idempotency_conflict',reason:'The provider reported a request-key conflict. An administrator must inspect it before resending.'};
 return {state:'failed',code:'provider_rejected',reason:'The email provider rejected this invitation. Check the sender setup, quota, and recipient address.'};
}
export function boundedFailure(failure:SendFailure,attempt:number,firstAttempt:number,provider:string,now=Date.now()):SendFailure{
 if(failure.state!=='retry')return failure;
 if(attempt>=MAX_ATTEMPTS)return {state:'review',code:'retries_exhausted',reason:'Automatic retries were exhausted. An administrator must check provider logs.'};
 if(provider==='resend'&&now+retryDelay(attempt)-firstAttempt>=IDEMPOTENCY_WINDOW_MS)return {state:'review',code:'idempotency_expired',reason:'The safe retry window has expired. Check provider logs before resending.'};
 return failure;
}
export function webhookState(type:string):DeliveryState|null{
 return ({'email.sent':'accepted','email.delivered':'delivered','email.delivery_delayed':'delayed','email.bounced':'bounced','email.failed':'failed','email.complained':'complained','email.suppressed':'failed'} as Record<string,DeliveryState>)[type]||null;
}
export function deliveryMessage(d:{total?:number;pending:number;needsReview:number;failed?:number;delivered?:number;accepted?:number;retrying?:number;delayed?:number}){
 if(d.failed)return `${d.failed} invitation(s) could not be delivered. The planner can view the affected attendees below.`;
 if(d.needsReview)return `${d.needsReview} invitation(s) have unconfirmed delivery and need administrator attention.`;
 if(d.pending)return 'Invitations are queued or retrying automatically. You can close this page.';
 if(d.delayed)return 'The receiving mail server delayed some invitations. The provider is continuing delivery attempts.';
 if(d.total&&d.delivered===d.total)return 'All invitations reached the recipients’ mail servers. Inbox placement and calendar acceptance are not confirmed.';
 if(d.total)return 'The email provider accepted the invitations. Recipient delivery is not yet confirmed.';
 return 'This time is confirmed in Wharf.';
}

export type DeliveryReport={total:number;pending:number;ready:number;needsReview:number;retrying:number;accepted:number;delivered:number;delayed:number;failed:number;recipients?:{name:string;status:DeliveryState;reason:string|null;nextAttemptAt:string|null}[]};
export const deliveryLabels:Record<DeliveryState,string>={queued:'Queued',sending:'Sending',retry:'Retry scheduled',accepted:'Accepted by email provider',delivered:'Delivered to mail server',delayed:'Delivery delayed',bounced:'Bounced',failed:'Send failed',complained:'Marked as spam',review:'Delivery unconfirmed'};
