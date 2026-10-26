import {sql,hash} from './auth';
import type {Interval} from './availability';

export async function resolveInvitation(meetingId:string,invitationToken:unknown,googleSub?:string|null){
 const [row]=await sql()`SELECT agent_request_id,final_time FROM requests WHERE id=${meetingId}`;
 if(row?.final_time)throw Error('This meeting already has a confirmed time.');
 if(!row?.agent_request_id)return null;
 const [invite]=typeof invitationToken==='string'?await sql()`SELECT id FROM request_invitees WHERE meeting_id=${meetingId} AND token_hash=${hash(invitationToken)}`:
  googleSub?await sql()`SELECT id FROM request_invitees WHERE meeting_id=${meetingId} AND google_sub=${googleSub}`:[];
 if(!invite)throw Error('Open your personal invitation link to join this meeting.');
 return invite.id as string;
}

// All attendance mutations and finalization share requests.revision. A concurrent
// mutation loses the compare-and-swap instead of silently confirming stale data.
export async function persistCalendarSnapshot(id:string,sub:string,name:string,busy:Interval[],sessionId:string,inviteeId:string|null=null){
 const [row]=await sql()`SELECT * FROM requests WHERE id=${id} AND created_at::timestamptz>now()-interval '30 days'`;
 if(!row||row.final_time)throw Error('Meeting expired or already finalized.');
 if(row.agent_request_id){
  if(!inviteeId)throw Error('A personal invitation is required.');
  const invites=await sql()`SELECT id,google_sub FROM request_invitees WHERE meeting_id=${id}`;
  const target=invites.find(p=>p.id===inviteeId);
  if(!target||(target.google_sub&&target.google_sub!==sub)||invites.some(p=>p.id!==inviteeId&&p.google_sub===sub))throw Error('This invitation is already used, or this Google account has already responded under another invitation.');
 }
 const [identity]=await sql()`SELECT email FROM sessions WHERE id=${sessionId} AND google_sub=${sub}`;
 const [result]=await sql()`WITH changed AS (
  UPDATE requests SET revision=revision+1,planner_name=CASE WHEN owner_session=${sessionId} THEN ${name.slice(0,100)} ELSE planner_name END
  WHERE id=${id} AND revision=${row.revision} AND final_time IS NULL RETURNING id
 ), saved AS (
  INSERT INTO attendees(meeting_id,google_sub,name,busy,email)
  SELECT id,${sub},${name.slice(0,100)},${JSON.stringify(busy)}::jsonb,${identity?.email||null} FROM changed
  ON CONFLICT(meeting_id,google_sub) DO UPDATE SET email=COALESCE(EXCLUDED.email,attendees.email),name=EXCLUDED.name,busy=CASE WHEN ${!!row.agent_request_id} THEN EXCLUDED.busy ELSE attendees.busy END,captured_at=CASE WHEN ${!!row.agent_request_id} THEN now() ELSE attendees.captured_at END RETURNING meeting_id
 ), claimed AS (
  UPDATE request_invitees SET google_sub=${sub} WHERE meeting_id IN (SELECT meeting_id FROM saved) AND id=${inviteeId} RETURNING id
 ) SELECT (SELECT count(*) FROM saved)::int AS saved`;
 if(!result.saved)throw Error('The meeting changed while connecting. Please try again.');
}
export async function withdrawSnapshot(id:string,sub:string){
 const [row]=await sql()`SELECT revision,final_time,agent_request_id FROM requests WHERE id=${id} AND EXISTS(SELECT 1 FROM attendees WHERE meeting_id=${id} AND google_sub=${sub})`;
 if(!row)return;
 const [booked]=await sql()`SELECT 1 FROM google_meeting_events WHERE meeting_id=${id}`;
 if(booked||(row.final_time&&!row.agent_request_id))throw Error('This meeting has already been finalized.');
 const [result]=await sql()`WITH changed AS (
  UPDATE requests SET revision=revision+1,final_time=CASE WHEN agent_request_id IS NOT NULL THEN NULL ELSE final_time END WHERE id=${id} AND revision=${row.revision} AND NOT EXISTS(SELECT 1 FROM google_meeting_events WHERE meeting_id=${id}) RETURNING id
 ), removed AS (
  DELETE FROM attendees WHERE meeting_id IN (SELECT id FROM changed) AND google_sub=${sub} RETURNING meeting_id
 ), unclaimed AS (
  UPDATE request_invitees SET google_sub=NULL WHERE meeting_id IN (SELECT meeting_id FROM removed) AND google_sub=${sub} RETURNING id
 ) SELECT (SELECT count(*) FROM changed)::int AS changed`;
 if(!result.changed)throw Error('The meeting changed. Please try again.');
}
