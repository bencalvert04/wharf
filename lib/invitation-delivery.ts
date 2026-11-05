import type {CalendarDatabase} from './calendar-connection-store.ts';

export class InvitationNotSentError extends Error {}

/** Claim once: SMTP cannot tell us whether an interrupted send was accepted. */
export async function deliverInvitationJobs<Payload>(db:CalendarDatabase,send:(payload:Payload,id:string)=>Promise<string>,meetingId?:string){
 const jobs=await db`UPDATE invitation_outbox SET lease_until=now()+interval '2 minutes',
  first_attempt_at=COALESCE(first_attempt_at,now()),attempts=attempts+1
  WHERE id IN (SELECT id FROM invitation_outbox WHERE sent_at IS NULL
   AND (${meetingId||null}::text IS NULL OR meeting_id=${meetingId||null})
   AND first_attempt_at IS NULL
   ORDER BY created_at LIMIT 4 FOR UPDATE SKIP LOCKED) RETURNING *`;
 let accepted=0;
 await Promise.all(jobs.map(async job=>{
  try{
   const messageId=await send(job.payload,job.id);
   await db`UPDATE invitation_outbox SET sent_at=now(),provider_id=${messageId},lease_until=NULL,last_error=NULL WHERE id=${job.id}`;
   accepted++;
  }catch(error){
   const reason=error instanceof InvitationNotSentError?error.message:'Delivery unconfirmed. Review Gmail Sent before attempting any resend.';
   await db`UPDATE invitation_outbox SET lease_until=NULL,last_error=${reason} WHERE id=${job.id}`;
  }
 }));
 const [counts]=await db`SELECT count(*) FILTER(WHERE sent_at IS NULL)::int AS pending,
  count(*) FILTER(WHERE sent_at IS NULL AND first_attempt_at IS NOT NULL AND (lease_until IS NULL OR lease_until<now()))::int AS needs_review
  FROM invitation_outbox WHERE (${meetingId||null}::text IS NULL OR meeting_id=${meetingId||null})`;
 return {accepted,pending:counts.pending,needsReview:counts.needs_review};
}
