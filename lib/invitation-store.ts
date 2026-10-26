import type {sql} from './auth';
export type DeliveryDatabase=ReturnType<typeof sql>;

export async function recoverInterruptedInvitations(db:DeliveryDatabase){
 // Recover interrupted workers. SMTP may have submitted DATA before dying, so it
 // cannot be retried blindly. Resend can replay inside its 24-hour key window.
 await db`UPDATE invitation_outbox SET state=CASE WHEN provider='resend' AND attempts<8 AND first_attempt_at>now()-interval '23 hours' THEN 'retry' ELSE 'review' END,
  lease_until=NULL,retry_at=now(),attempt_token=NULL,last_error_code='worker_interrupted',last_error='The delivery worker stopped before confirming the result.'
  WHERE state='sending' AND lease_until<now()`;
 await db`UPDATE invitation_outbox SET state='review',last_error_code='idempotency_expired',last_error='The safe retry window expired. Check provider logs before resending.'
  WHERE state='retry' AND provider='resend' AND first_attempt_at<=now()-interval '23 hours'`;
}

export function claimInvitations(db:DeliveryDatabase,provider:string,token:string,meetingId?:string){
 return db`UPDATE invitation_outbox SET state='sending',lease_until=now()+interval '2 minutes',attempt_token=${token},
  first_attempt_at=COALESCE(first_attempt_at,now()),attempts=attempts+1,provider=COALESCE(provider,${provider})
  WHERE id IN (SELECT o.id FROM invitation_outbox o JOIN requests r ON r.id=o.meeting_id
   WHERE o.state IN ('queued','retry') AND o.retry_at<=now() AND o.attempts<8
   AND r.created_at::timestamptz>now()-interval '30 days'
   AND (${meetingId||null}::text IS NULL OR o.meeting_id=${meetingId||null})
   ORDER BY o.retry_at,o.created_at LIMIT 4 FOR UPDATE OF o SKIP LOCKED) RETURNING *`;
}

export function recordAccepted(db:DeliveryDatabase,id:string,token:string,messageId:string){
 return db`UPDATE invitation_outbox SET state='accepted',sent_at=now(),provider_id=${messageId},lease_until=NULL,last_error=NULL,last_error_code=NULL
 WHERE id=${id} AND attempt_token=${token} AND state='sending' RETURNING id`;
}
