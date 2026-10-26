import {recoverInterruptedInvitations,claimInvitations,recordAccepted} from './invitation-store';
import {randomUUID} from 'node:crypto';
import {configuredProvider,providerConfigured,sendInvitation,InvitationSendError} from './invitation-provider';
import {boundedFailure,retryDelay,classifyResendFailure} from './delivery-policy';
import {deliverySummary} from './delivery-summary';
import {sql,appUrl,hash} from './auth';
import {invitationEmail,validEmail} from './calendar-invitation';

export const invitationsConfigured=providerConfigured;
/** Call after Ben's finalization transaction has committed. final_time is {start,end} in UTC. */
export async function queueMeetingInvitations(meetingId:string){
 if(!invitationsConfigured())throw Error('Calendar invitation delivery is not configured.');
 const [row]=await sql()`SELECT * FROM requests WHERE id=${meetingId} AND created_at::timestamptz>now()-interval '30 days'`;
 if(!row)throw Error('Meeting not found or expired.');
 const c=JSON.parse(row.constraints);
 if(c.demo)throw Error('Sample meetings cannot send invitations.');
 const final=typeof row.final_time==='string'?JSON.parse(row.final_time):row.final_time;
 if(!final)throw Error('The planner must select a final time first.');
 const start=typeof final.start==='number'?final.start:Date.parse(final.start);
 const end=typeof final.end==='number'?final.end:Date.parse(final.end);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end-start!==c.duration*60000)throw Error('Invalid final meeting time.');
 const people=await sql()`SELECT google_sub,name,email FROM attendees WHERE meeting_id=${meetingId}`;
 if(!people.length)throw Error('No attendees have joined.');
 if(people.some(p=>!validEmail(p.email)))throw Error('Some attendees need to reconnect Google to provide their invitation email.');
 const sender=process.env.INVITATION_FROM!;
 // Existing rows are immutable: repeated finalization does not queue duplicate recipients.
 const now=Date.now();
 const unique=new Map(people.map(p=>[p.email.toLowerCase(),p]));
 const database=sql();
 await database.transaction([...unique.values()].map(p=>{
  const payload=invitationEmail({id:meetingId,title:c.title,start,end,createdAt:now,organizer:sender,zone:c.zone,plannerName:row.planner_name,recipient:{name:p.name,email:p.email},url:appUrl()+'/?meeting='+encodeURIComponent(meetingId)});
  return database`INSERT INTO invitation_outbox(id,meeting_id,recipient_key,payload) VALUES(${randomUUID()},${meetingId},${hash(p.email.toLowerCase())},${JSON.stringify(payload)}::jsonb) ON CONFLICT(meeting_id,recipient_key) DO NOTHING`;
 }));
}

/** A database lease fences concurrent workers; Resend retries reuse one immutable key. */
export async function deliverInvitations(meetingId?:string){
 if(!invitationsConfigured())throw Error('Calendar invitation delivery is not configured.');
 const db=sql(),provider=configuredProvider(),token=randomUUID();
 await recoverInterruptedInvitations(db);
 const jobs=await claimInvitations(db,provider,token,meetingId);
 await Promise.all(jobs.map(async job=>{
  try{
   const messageId=await sendInvitation(job.payload,job.id,job.provider);
   await recordAccepted(db,job.id,token,messageId);
  }catch(error){
   const failure=boundedFailure(error instanceof InvitationSendError?error.failure:job.provider==='resend'?classifyResendFailure(0):{state:'review',code:'submission_uncertain',reason:'The send result could not be recorded. Check sender logs before resending.'},job.attempts,new Date(job.first_attempt_at).getTime(),job.provider);
   const next=new Date(Date.now()+retryDelay(job.attempts)).toISOString();
   await db`UPDATE invitation_outbox SET state=${failure.state},retry_at=${next},lease_until=NULL,last_error=${failure.reason},last_error_code=${failure.code}
    WHERE id=${job.id} AND attempt_token=${token} AND state='sending'`;
  }
 }));
 return deliverySummary(meetingId);
}
