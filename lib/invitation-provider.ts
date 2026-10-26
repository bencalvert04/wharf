import {sendGmailInvitation,gmailConfigured} from './gmail-delivery.ts';
import {validEmail,type invitationEmail} from './calendar-invitation.ts';
import {classifyResendFailure,classifySmtpFailure,type SendFailure} from './delivery-policy.ts';
export type EmailPayload=ReturnType<typeof invitationEmail>;
export function configuredProvider(){return process.env.INVITATION_PROVIDER||'gmail'}
export function providerConfigured(){
 const provider=configuredProvider();
 if(provider==='gmail')return gmailConfigured();
 return provider==='resend'&&validEmail(process.env.INVITATION_FROM)&&!/@(?:gmail|googlemail)\.com$/i.test(process.env.INVITATION_FROM)&&!!process.env.RESEND_API_KEY;
}
export class InvitationSendError extends Error{
 failure:SendFailure;
 constructor(failure:SendFailure){super(failure.reason);this.failure=failure}
}
export async function sendViaResend(payload:EmailPayload,id:string,key:string,fetcher:typeof fetch=fetch){
 let response:Response;
 try{response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'wharf-invitation/'+id},body:JSON.stringify({...payload,tags:[{name:'invitation_id',value:id}]}),signal:AbortSignal.timeout(15000)})}
 catch{throw new InvitationSendError(classifyResendFailure(0))}
 const result=await response.json().catch(()=>null);
 if(!response.ok)throw new InvitationSendError(classifyResendFailure(response.status,result?.name));
 if(typeof result?.id!=='string')throw new InvitationSendError(classifyResendFailure(0));
 return result.id as string;
}
export async function sendInvitation(payload:EmailPayload,id:string,provider:string){
 if(payload.from!==`Wharf <${process.env.INVITATION_FROM}>`)throw new InvitationSendError({state:'failed',code:'sender_changed',reason:'This invitation belongs to a different sender configuration. An administrator must inspect it.'});
 if(provider!==configuredProvider()||!providerConfigured())throw new InvitationSendError({state:'failed',code:'provider_setup',reason:'Email delivery configuration changed or is incomplete. Contact the Wharf administrator.'});
 if(provider==='resend')return sendViaResend(payload,id,process.env.RESEND_API_KEY!);
 try{return await sendGmailInvitation(payload,id)}catch(error){throw new InvitationSendError(classifySmtpFailure(error))}
}
