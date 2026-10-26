import {googleMeetingEvent,calendarStatus} from '@/lib/google-meeting-events';
import {availabilityRevision} from '@/lib/finalization';
import {samplePeople} from '@/lib/demo';
import {session,sql,meeting,keyMatches,json,hash,sameOrigin} from '@/lib/auth';
import {shared,alternatives} from '@/lib/availability';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;const row=await meeting(id);if(!row)return json({error:'Meeting not found or expired.'},404);const invite=new URL(req.url).searchParams.get('invite');const [invitation]=invite?await sql()`SELECT name FROM request_invitees WHERE meeting_id=${id} AND token_hash=${hash(invite)}`:[];const s=await session();if(JSON.parse(row.constraints).demo&&s?.id!==row.owner_session)return json({error:'This demo belongs to another browser. Open the example to try your own calendar.'},403);const key=req.headers.get('authorization')?.replace(/^Bearer /,'');const isPlanner=!!((s&&s.id===row.owner_session)||(key&&keyMatches(key,row.planner_key)));const [joined]=s?.google_sub?await sql()`SELECT 1 FROM attendees WHERE meeting_id=${id} AND google_sub=${s.google_sub}`:[];const canView=isPlanner||!!joined;const c=JSON.parse(row.constraints);const people=canView?await sql()`SELECT google_sub,name,email,busy,captured_at FROM attendees WHERE meeting_id=${id} ORDER BY captured_at`:[];const combined:any[]=canView&&c.demo?[...samplePeople(c).slice(0,c.sampleCount||4),...people]:people;const windows=combined.length?shared(c,combined as any):[];const [delivery]=canView&&row.final_time?await sql()`SELECT count(*)::int AS total,count(*) FILTER(WHERE sent_at IS NULL)::int AS pending,count(*) FILTER(WHERE sent_at IS NULL AND first_attempt_at IS NOT NULL AND (lease_until IS NULL OR lease_until<now()))::int AS needs_review FROM invitation_outbox WHERE meeting_id=${id}`:[];const calendar=canView?calendarStatus(await googleMeetingEvent(id)):null;return json({id,calendar,tracked:!!row.agent_request_id,invitationName:invitation?.name||null,constraints:c,delivery:delivery?{total:delivery.total,pending:delivery.pending,needsReview:delivery.needs_review}:null,createdAt:row.created_at,finalTime:row.final_time?{...row.final_time,start:typeof row.final_time.start==='number'?row.final_time.start:Date.parse(row.final_time.start),end:typeof row.final_time.end==='number'?row.final_time.end:Date.parse(row.final_time.end)}:null,revision:canView?availabilityRevision(people as any):null,isPlanner,joined:!!joined,canView,attendees:combined.map(p=>({name:p.name,sample:!!p.sample,capturedAt:p.captured_at})),windows,bestWindows:combined.length&&!windows.some(w=>w.end-w.start>=c.duration*60000)?alternatives(c,combined as any):[]})}catch{return json({error:'Unable to load meeting. Please try again.'},503)}}

export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}) {
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 try {
  const {id}=await params;
  const row=await meeting(id);
  if(!row)return json({error:'Meeting not found or expired.'},404);
  const s=await session();
  const key=req.headers.get('authorization')?.replace(/^Bearer /,'');
  const isPlanner=!!((s&&s.id===row.owner_session)||(key&&keyMatches(key,row.planner_key)));
  if(!isPlanner)return json({error:'Only the planner can delete this meeting.'},403);
  await sql()`DELETE FROM requests WHERE id=${id}`;
  return json({ok:true});
 }catch{return json({error:'Could not delete this meeting. Please try again.'},503)}
}
