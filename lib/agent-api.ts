import {randomUUID,createHmac} from 'node:crypto';
import {ZodError} from 'zod';
import {sql,hash,keyMatches,appUrl,sameOrigin} from './auth';
import {createMeetingSchema,toConstraints,finalizeSchema,pageSchema} from './agent-contract';
import {meetingSlots} from './agent-slots';

export class AgentError extends Error{constructor(public code:string,message:string,public status=400,public nextAction='Correct the request and retry.'){super(message)}}
export function agentKey(req:Request){const key=req.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];if(!key)throw new AgentError('unauthorized','Supply a random 32-byte base64url meeting key as Authorization: Bearer <key>.',401,'Generate and save a key before creation; reuse that meeting’s key for subsequent calls.');return key}
export async function agentBody(req:Request){if(!sameOrigin(req))throw new AgentError('invalid_origin','Origin is not allowed.',403);const raw=await req.text();if(Buffer.byteLength(raw)>32768)throw new AgentError('payload_too_large','Limit request bodies to 32 KB.',413);try{return JSON.parse(raw)}catch{throw new AgentError('invalid_json','Send a valid JSON object.')}}
export async function agentResponse(run:()=>Promise<unknown>,status=200){try{return Response.json(await run(),{status,headers:{'Cache-Control':'no-store'}})}catch(e){const known=e instanceof AgentError,zod=e instanceof ZodError;return Response.json({error:{code:known?e.code:zod?'invalid_input':'service_unavailable',message:known?e.message:zod?'Check the highlighted fields.':'Wharf could not complete this request. Retry with the same key and inputs.',retryable:!known&&!zod,nextAction:known?e.nextAction:zod?'Correct the fields and retry.':'Retry after 15 seconds.',...(zod?{fields:e.issues.map(i=>({path:i.path.join('.'),message:i.message}))}:{})}},{status:known?e.status:zod?400:503,headers:{'Cache-Control':'no-store',...(!known&&!zod?{'Retry-After':'15'}:{})}})}}
export const invitationToken=(key:string,id:string,participantId:string)=>createHmac('sha256',key).update(`wharf-invite-v1:${id}:${participantId}`).digest('base64url');
export async function loadAgentMeeting(id:string,key:string){
 const [row]=await sql()`SELECT r.*,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'googleSub',p.google_sub) ORDER BY p.position) FROM request_invitees p WHERE p.meeting_id=r.id),'[]'::jsonb) AS invitees,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('googleSub',a.google_sub,'name',a.name,'busy',a.busy,'capturedAt',a.captured_at) ORDER BY a.google_sub) FROM attendees a WHERE a.meeting_id=r.id),'[]'::jsonb) AS people
  FROM requests r WHERE r.id=${id} AND r.agent_request_id IS NOT NULL AND r.created_at::timestamptz>now()-interval '30 days'`;
 if(!row||!keyMatches(key,row.planner_key))throw new AgentError('meeting_not_found','Meeting not found, expired, or this key does not grant access.',404,'Check the meeting ID and its saved key.');
 return row;
}
export function describeMeeting(row:any,key:string){
 const c=JSON.parse(row.constraints),people=row.people as any[];
 const participants=(row.invitees as any[]).map(p=>{const a=people.find(a=>a.googleSub===p.googleSub);return {id:p.id,name:p.name,status:a?'responded':'awaiting_response',googleDisplayName:a?.name||null,capturedAt:a?.capturedAt||null,invitationUrl:`${appUrl()}/?meeting=${row.id}&invite=${invitationToken(key,row.id,p.id)}`}});
 const waiting=participants.filter(p=>p.status==='awaiting_response').map(p=>p.id),complete=waiting.length===0;
 const slots=complete?meetingSlots(row.id,c,people):[];
 const status=row.final_time?'finalized':waiting.length?'awaiting_responses':slots.length?'ready':'no_overlap';
 return {id:row.id,title:c.title,status,revision:Number(row.revision),createdAt:row.created_at,expiresAt:new Date(Date.parse(row.created_at)+30*86400000).toISOString(),constraints:c,participants,responseSummary:{expected:participants.length,responded:participants.length-waiting.length,waitingFor:waiting},availability:{source:'google_calendar_snapshot',live:false,slotCount:slots.length,slotsUrl:`${appUrl()}/api/v1/meetings/${row.id}/slots`},finalTime:row.final_time||null,calendarEventCreated:false,nextAction:status==='awaiting_responses'?{type:'share_invitations',participantIds:waiting,pollAfterSeconds:30,message:'Send each person only their own invitation URL. They must connect Google themselves. Poll after 30 seconds; do not treat partial responses as consensus.'}:status==='ready'?{type:'choose_slot',message:'Get exact slots, then finalize one with this revision. Finalization records a choice; it does not book a calendar event.'}:status==='no_overlap'?{type:'revise_request',message:'No future slot fits everyone. Create a new request with a wider range or different duration after agreeing changes with the organizer.'}:{type:'done',message:'Time confirmed in Wharf. No Google Calendar event or notification has been sent.'}};
}
export async function createAgentMeeting(req:Request,raw:unknown){
 const key=agentKey(req),v=createMeetingSchema.parse(raw),c=toConstraints(v);
 const requestId=req.headers.get('idempotency-key');
 if(!requestId||!/^[-A-Za-z0-9_.:]{8,128}$/.test(requestId))throw new AgentError('idempotency_key_required','Supply an Idempotency-Key of 8 to 128 letters, digits, hyphens, periods, colons or underscores.');
 // Canonicalize defaults and roster order so retries are independent of JSON key ordering.
 const participants=[...v.participants].sort((a,b)=>a.id.localeCompare(b.id)),fingerprint=hash(JSON.stringify({constraints:c,participants}));
 const id=randomUUID(),plannerHash='sha256:'+hash(key),now=new Date().toISOString();
 const records=participants.map((p,i)=>({...p,position:i,tokenHash:hash(invitationToken(key,id,p.id))}));
 await sql()`WITH created AS (
  INSERT INTO requests(id,constraints,created_at,planner_key,agent_request_id,agent_input_hash)
  VALUES(${id},${JSON.stringify(c)},${now},${plannerHash},${requestId},${fingerprint})
  ON CONFLICT DO NOTHING RETURNING id
 ) INSERT INTO request_invitees(meeting_id,id,name,position,token_hash)
 SELECT created.id,p->>'id',p->>'name',(p->>'position')::int,p->>'tokenHash' FROM created,jsonb_array_elements(${JSON.stringify(records)}::jsonb) p`;
 const [existing]=await sql()`SELECT id,agent_input_hash,created_at FROM requests WHERE planner_key=${plannerHash} AND agent_request_id=${requestId}`;
 if(!existing)throw new AgentError('key_already_used','This meeting key already belongs to another creation attempt.',409,'Generate a new random meeting key for a new request.');
 if(existing.agent_input_hash!==fingerprint)throw new AgentError('idempotency_conflict','This key was already used with different meeting details.',409,'Use the original inputs for a retry, or a new Idempotency-Key for a new meeting.');
 if(Date.parse(existing.created_at)+30*86400000<=Date.now())throw new AgentError('meeting_expired','The original meeting expired.',410,'Use a new Idempotency-Key to create a new meeting.');
 return {...describeMeeting(await loadAgentMeeting(existing.id,key),key),replayed:existing.id!==id};
}
export async function getAgentMeeting(id:string,key:string){return describeMeeting(await loadAgentMeeting(id,key),key)}
export async function getAgentSlots(id:string,key:string,query:unknown){const {offset,limit}=pageSchema.parse(query),row=await loadAgentMeeting(id,key),meeting=describeMeeting(row,key);const slots=meeting.status==='ready'?meetingSlots(id,JSON.parse(row.constraints),row.people):[];return {meetingId:id,status:meeting.status,revision:meeting.revision,source:'google_calendar_snapshot',slots:slots.slice(offset,offset+limit),total:slots.length,nextOffset:offset+limit<slots.length?offset+limit:null,nextAction:meeting.nextAction}}
export async function finalizeAgentMeeting(id:string,key:string,raw:unknown){
 const input=finalizeSchema.parse(raw),row=await loadAgentMeeting(id,key),view=describeMeeting(row,key);
 if(row.final_time){if(row.final_time.slotId===input.slotId&&row.final_time.basedOnRevision===input.revision)return {...view,replayed:true};throw new AgentError('already_finalized','This meeting already has a confirmed time.',409,'Read the meeting to see the confirmed time.');}
 if(Number(row.revision)!==input.revision)throw new AgentError('stale_revision','Responses changed since you read the slots.',409,'Get slots again and use the returned revision.');
 if(view.status!=='ready')throw new AgentError('not_ready','All participants must respond and have a shared future slot.',409,view.nextAction.message);
 const slot=meetingSlots(id,JSON.parse(row.constraints),row.people).find(s=>s.id===input.slotId);
 if(!slot)throw new AgentError('invalid_slot','Choose an exact slot returned by Wharf. It may no longer be in the future.',409,'Get slots again.');
 const finalTime={slotId:slot.id,start:slot.start,end:slot.end,timezone:slot.timezone,basedOnRevision:input.revision,confirmedAt:new Date().toISOString()};
 const [updated]=await sql()`UPDATE requests SET final_time=${JSON.stringify(finalTime)}::jsonb,revision=revision+1 WHERE id=${id} AND revision=${input.revision} AND final_time IS NULL RETURNING id`;
 if(!updated){const current=await loadAgentMeeting(id,key);if(current.final_time?.slotId===input.slotId&&current.final_time?.basedOnRevision===input.revision)return {...describeMeeting(current,key),replayed:true};throw new AgentError('stale_revision','The meeting changed during confirmation.',409,'Read the meeting and slots again.');}
 return {...await getAgentMeeting(id,key),replayed:false};
}
