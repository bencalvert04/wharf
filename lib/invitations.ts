import {randomUUID} from 'node:crypto';
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
  const payload=invitationEmail({id:meetingId,title:c.title,start,end,createdAt:now,organizer:sender,recipient:{name:p.name,email:p.email},url:appUrl()+'/?meeting='+encodeURIComponent(meetingId)});
  return database`INSERT INTO invitation_outbox(id,meeting_id,recipient_key,payload) VALUES(${randomUUID()},${meetingId},${hash(p.email.toLowerCase())},${JSON.stringify(payload)}::jsonb) ON CONFLICT(meeting_id,recipient_key) DO NOTHING`;
 }));
}

/** SMTP has no idempotency key. Claim once; ambiguous failures require manual review. */
export async function deliverInvitations(meetingId?:string){
 if(!invitationsConfigured())throw Error('Calendar invitation delivery is not configured.');
 const jobs=await sql()`UPDATE invitation_outbox SET lease_until=now()+interval '2 minutes',
  first_attempt_at=COALESCE(first_attempt_at,now()),attempts=attempts+1
  WHERE id IN (SELECT id FROM invitation_outbox WHERE sent_at IS NULL
   AND (${meetingId||null}::text IS NULL OR meeting_id=${meetingId||null})
   AND first_attempt_at IS NULL
   ORDER BY created_at LIMIT 4 FOR UPDATE SKIP LOCKED) RETURNING *`;
 let accepted=0;
 await Promise.all(jobs.map(async job=>{
  try{
   const messageId=await sendGmailInvitation(job.payload,job.id);
   await sql()`UPDATE invitation_outbox SET sent_at=now(),provider_id=${messageId},lease_until=NULL,last_error=NULL WHERE id=${job.id}`;
   accepted++;
  }catch{
   await sql()`UPDATE invitation_outbox SET lease_until=NULL,last_error='Delivery unconfirmed. Review Gmail Sent before attempting any resend.' WHERE id=${job.id}`;
  }
 }));
 const [counts]=await sql()`SELECT count(*) FILTER(WHERE sent_at IS NULL)::int AS pending,
  count(*) FILTER(WHERE sent_at IS NULL AND first_attempt_at IS NOT NULL AND (lease_until IS NULL OR lease_until<now()))::int AS needs_review
  FROM invitation_outbox WHERE (${meetingId||null}::text IS NULL OR meeting_id=${meetingId||null})`;
 return {accepted,pending:counts.pending,needsReview:counts.needs_review};
}
