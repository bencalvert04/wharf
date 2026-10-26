import type {sql} from './auth';
export type PendingDatabase=ReturnType<typeof sql>;
export const pendingIdentity=(sessionId:string,googleSub:string|null)=>googleSub?'google:'+googleSub:'session:'+sessionId;
export function pendingMeetings(db:PendingDatabase,sessionId:string,googleSub:string|null){
 return db`SELECT r.id,r.constraints,r.final_time,r.last_activity_at,
  COALESCE(r.planner_name,(SELECT owner.name FROM sessions owner WHERE owner.id=r.owner_session)) AS planner_name,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('name',a.name) ORDER BY a.captured_at,a.google_sub) FROM attendees a WHERE a.meeting_id=r.id),'[]'::jsonb) AS attendees,
  (r.owner_session=${sessionId}) AS is_planner,
  EXISTS(SELECT 1 FROM attendees a WHERE a.meeting_id=r.id AND a.google_sub=${googleSub}) AS joined,
  EXISTS(SELECT 1 FROM meeting_memberships m WHERE m.meeting_id=r.id AND m.google_sub=${googleSub}) AS known_participant,
  (SELECT count(*)::int FROM attendees a WHERE a.meeting_id=r.id) AS attendee_count
  FROM requests r
  WHERE r.created_at::timestamptz>now()-interval '30 days'
  AND r.final_time IS NULL AND r.last_activity_at>now()-interval '7 days'
  AND COALESCE((r.constraints::jsonb->>'demo')::boolean,false)=false
  AND NOT EXISTS(SELECT 1 FROM pending_meeting_dismissals d WHERE d.meeting_id=r.id AND d.identity_key=${pendingIdentity(sessionId,googleSub)})
  AND (r.owner_session=${sessionId}
   OR EXISTS(SELECT 1 FROM attendees a WHERE a.meeting_id=r.id AND a.google_sub=${googleSub})
   OR EXISTS(SELECT 1 FROM meeting_memberships m WHERE m.meeting_id=r.id AND m.google_sub=${googleSub}))
  ORDER BY r.last_activity_at DESC,r.created_at::timestamptz DESC`;
}
export function recordMeetingVisit(db:PendingDatabase,id:string,sessionId:string,googleSub:string|null){
 return db`WITH visited AS (UPDATE requests r SET last_activity_at=now() WHERE r.id=${id}
  AND r.final_time IS NULL AND r.created_at::timestamptz>now()-interval '30 days'
  AND (r.owner_session=${sessionId}
   OR EXISTS(SELECT 1 FROM attendees a WHERE a.meeting_id=r.id AND a.google_sub=${googleSub})
   OR EXISTS(SELECT 1 FROM meeting_memberships m WHERE m.meeting_id=r.id AND m.google_sub=${googleSub})) RETURNING r.id), restored AS (DELETE FROM pending_meeting_dismissals WHERE meeting_id IN (SELECT id FROM visited) AND identity_key=${pendingIdentity(sessionId,googleSub)}) SELECT id FROM visited`;
}
export function rememberedInvitation(db:PendingDatabase,id:string,sub:string){
 return db`SELECT i.id FROM meeting_memberships m JOIN request_invitees i ON i.meeting_id=m.meeting_id AND i.id=m.invitee_id
  WHERE m.meeting_id=${id} AND m.google_sub=${sub} AND (i.google_sub IS NULL OR i.google_sub=${sub})`;
}

export function dismissPendingMeeting(db:PendingDatabase,id:string,sessionId:string,googleSub:string|null){
 return db`INSERT INTO pending_meeting_dismissals(meeting_id,identity_key)
  SELECT r.id,${pendingIdentity(sessionId,googleSub)} FROM requests r WHERE r.id=${id}
  AND r.created_at::timestamptz>now()-interval '30 days'
  AND (r.owner_session=${sessionId}
   OR EXISTS(SELECT 1 FROM attendees a WHERE a.meeting_id=r.id AND a.google_sub=${googleSub})
   OR EXISTS(SELECT 1 FROM meeting_memberships m WHERE m.meeting_id=r.id AND m.google_sub=${googleSub}))
  ON CONFLICT(meeting_id,identity_key) DO UPDATE SET dismissed_at=now() RETURNING meeting_id`;
}
