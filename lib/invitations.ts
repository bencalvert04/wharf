import {randomUUID} from 'node:crypto';
import {appleRelayEmailEnabled} from './apple-notifications';
import {InvitationNotSentError,deliverInvitationJobs} from './invitation-delivery';
import {gmailConfigured,sendGmailInvitation} from './gmail-delivery';
import {sql,appUrl,hash} from './auth';
import {invitationEmail,validEmail} from './calendar-invitation';

export const invitationsConfigured=gmailConfigured;
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

/** SMTP has no idempotency key. Ambiguous attempts require manual review. */
export async function deliverInvitations(meetingId?:string){
 if(!invitationsConfigured())throw Error('Calendar invitation delivery is not configured.');
 const db=sql();
 return deliverInvitationJobs<ReturnType<typeof invitationEmail>>(db,async(payload,id)=>{
  for(const recipient of payload.to)if(!await appleRelayEmailEnabled(db,recipient))throw new InvitationNotSentError('Apple email forwarding is disabled. Invitation was not sent.');
  return sendGmailInvitation(payload,id);
 },meetingId);
}
