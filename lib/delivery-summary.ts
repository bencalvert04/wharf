import {sql,hash} from './auth';
import type {DeliveryState} from './delivery-policy.ts';
export async function deliverySummary(id?:string,includeRecipients=false){
 const rows=await sql()`SELECT id,state,last_error,retry_at,lease_until FROM invitation_outbox WHERE (${id||null}::text IS NULL OR meeting_id=${id||null}) ORDER BY created_at,id`;
 const count=(states:DeliveryState[])=>rows.filter(r=>states.includes(r.state)).length;
 const summary={total:rows.length,pending:count(['queued','sending','retry','review']),ready:rows.filter(r=>['queued','retry'].includes(r.state)&&new Date(r.retry_at).getTime()<=Date.now()).length,
  needsReview:count(['review']),retrying:count(['retry']),accepted:count(['accepted']),delivered:count(['delivered']),delayed:count(['delayed']),failed:count(['bounced','failed','complained'])};
 if(!includeRecipients)return summary;
 const details=await sql()`SELECT recipient_key,state,last_error,retry_at FROM invitation_outbox WHERE (${id||null}::text IS NULL OR meeting_id=${id||null}) ORDER BY created_at,id`;
 const people=await sql()`SELECT name,email FROM attendees WHERE (${id||null}::text IS NULL OR meeting_id=${id||null})`;
 const names=new Map(people.filter(p=>p.email).map(p=>[hash(p.email.toLowerCase()),p.name]));
 return {...summary,recipients:details.map(row=>({name:names.get(row.recipient_key)||'Attendee',status:row.state as DeliveryState,reason:row.last_error||null,nextAttemptAt:row.state==='retry'?row.retry_at:null}))};
}
