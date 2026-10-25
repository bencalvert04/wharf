import nodemailer from 'nodemailer';
import {validEmail, type invitationEmail} from './calendar-invitation.ts';
type Payload=ReturnType<typeof invitationEmail>;
export function gmailConfigured(){
 return validEmail(process.env.INVITATION_FROM)&&process.env.INVITATION_FROM.toLowerCase().endsWith('@gmail.com')&&!!process.env.GMAIL_APP_PASSWORD?.replace(/\s/g,'');
}
export function gmailTransport(){
 if(!gmailConfigured())throw Error('Gmail invitation sending is not configured.');
 return nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,
  auth:{user:process.env.INVITATION_FROM,pass:process.env.GMAIL_APP_PASSWORD!.replace(/\s/g,'')},
  connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,
  disableFileAccess:true,disableUrlAccess:true});
}
export function gmailMessage(payload:Payload,jobId:string){
 if(payload.from!==`Wharf <${process.env.INVITATION_FROM}>`)throw Error('Invitation sender does not match the configured Gmail account.');
 if(!/^[a-zA-Z0-9-]+$/.test(jobId))throw Error('Invalid delivery identifier.');
 if(payload.to.length!==1||!validEmail(payload.to[0]))throw Error('Invalid invitation recipient.');
 return {from:payload.from,to:payload.to,subject:payload.subject,text:payload.text,
  messageId:`<wharf-${jobId}@${process.env.INVITATION_FROM!.split('@')[1]}>`,
  icalEvent:{filename:'invitation.ics',method:'REQUEST',content:Buffer.from(payload.attachments[0].content,'base64').toString('utf8')},
  disableFileAccess:true,disableUrlAccess:true};
}
export async function sendGmailInvitation(payload:Payload,jobId:string){
 const message=gmailMessage(payload,jobId);
 const result=await gmailTransport().sendMail(message);
 if(result.rejected.length||!result.accepted.length)throw Error('Gmail did not accept the invitation.');
 return result.messageId;
}
