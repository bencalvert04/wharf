import {meetingSlots} from './agent-slots';
import {missingMeetingDetail,askPrivately,timeRangeAnswer,timePresetAnswer} from './slack-clarification';
import {channelRoster,enrollRoster} from './slack-roster';
import {resolveSlackFollowup,runSlackBooking} from './slack-booking-flow';
import {refreshAgentAvailability} from './agent-refresh';
import {authorizeAgentCalendar,hasAgentCalendarPermission} from './agent-calendar-authorization';
import {attendFromSlack,canAttendSlackMeeting,notifyCalendarsReady,suggestEarliestSlackTime} from './slack-attendance';
import {slackMeetingWhen} from './slack-meeting-when';
import {slackHistory} from './slack-history';
import {slackMeetingName} from './slack-meeting-name';
import {randomUUID,randomBytes} from 'node:crypto';
import {sql,appUrl} from './auth';
import {sealToken,openToken} from './token-vault';
import {createAgentMeeting,getAgentMeeting,getAgentSlots,loadAgentMeeting,AgentError} from './agent-api';
import {prepareAgentCalendar,bookAgentMeeting} from './agent-booking';
import {interpretOpenSlackRequest} from './slack-agent';
import {slackEscape,canControlMeeting,slackIntent} from './slack-security';
import {slack,slackMessage,slackPrivateMessage,slackBlocks,slackButton} from './slack-client';
const keyFor=(r:any)=>openToken(r.key_cipher,`slack:${r.id}`);
const reply=(r:any,text:string,buttons:unknown[]=[])=>slackPrivateMessage(r.channel_id,r.organizer_id,text,buttons.length?slackBlocks(text,buttons):undefined);
const refresh=(id:string)=>slackButton('Click to attend','wharf_attend',id);

export async function slackMention(envelope:any){
 const promptStarted=Date.now();
 const e=envelope.event,thread=e.thread_ts||e.ts,intent=slackIntent(e.text);
 if(intent==='hold'){await sql()`UPDATE slack_meetings SET pending_booking=false WHERE team_id=${envelope.team_id} AND channel_id=${e.channel} AND organizer_id=${e.user} AND (${!e.thread_ts} OR thread_ts=${thread} OR invitation_ts=${thread})`;await slackPrivateMessage(e.channel,e.user,'I cleared the pending booking request in this conversation. This does not cancel an event already created in Google Calendar.');return}
 if(intent==='book'||intent==='status'){
  const candidates=await sql()`SELECT s.*,r.final_time IS NOT NULL AS finalized FROM slack_meetings s LEFT JOIN requests r ON r.id=s.meeting_id WHERE s.team_id=${envelope.team_id} AND s.channel_id=${e.channel} AND s.created_at>now()-interval '30 days' ORDER BY s.created_at DESC`;
  const resolved=resolveSlackFollowup(candidates,{team:envelope.team_id,channel:e.channel,user:e.user,thread:e.thread_ts});
  if(!resolved.meeting){await slackPrivateMessage(e.channel,e.user,resolved.ambiguous?'There are several open meetings here. Reply in the thread of the meeting you want me to book and mention @Wharf so I use the right attendees.':'I could not find one open meeting you requested here. Reply in the original meeting thread and mention @Wharf, or tell me the details for a new meeting.');return}
  const r=resolved.meeting;
  if(r.organizer_id!==e.user){await slackPrivateMessage(e.channel,e.user,'Only the original requester can ask me to book this meeting.');return}
  if(intent==='book')await bookFromSlack(r);else await status(r);return;
 }
 // Ask the common missing-detail question before history, roster, or model calls.
 const [early]=await sql()`SELECT c.messages,EXISTS(SELECT 1 FROM slack_meetings m WHERE m.team_id=${envelope.team_id} AND m.channel_id=${e.channel} AND m.thread_ts=${thread}) AS created FROM (SELECT 1) seed LEFT JOIN slack_context c ON c.team_id=${envelope.team_id} AND c.channel_id=${e.channel} AND c.thread_ts=${thread} AND c.user_id=${e.user} AND c.updated_at>now()-interval '1 day'`;
 const missing=missingMeetingDetail([...(early.messages||[]).filter((m:string)=>!m.startsWith('Wharf asked:')),e.text].join(' '));
 if(intent!=='help'&&!early.created&&missing){
  const messages=[...(early.messages||[]),e.text.slice(0,4000)].slice(-6);
  await sql()`INSERT INTO slack_context(team_id,channel_id,thread_ts,user_id,messages) VALUES(${envelope.team_id},${e.channel},${thread},${e.user},${JSON.stringify(messages)}::jsonb) ON CONFLICT(team_id,channel_id,thread_ts,user_id) DO UPDATE SET messages=EXCLUDED.messages,updated_at=now()`;
  await askPrivately(e.channel,e.user,thread,missing.question,missing.duration);console.info('Private clarification delivered',{processingMs:Date.now()-promptStarted,messageToPromptMs:Date.now()-Number(e.ts)*1000});return;
 }
 if(slackIntent(e.text)==='help'){await slackPrivateMessage(e.channel,e.user,"Tell me when you want to meet, like “15 minutes sometime today.” I’ll include everyone here and help you choose a time privately.");return}
 const started=Date.now();
 // Run metadata calls alongside the database/model work, with a bounded fallback.
 const group=(process.env.SLACK_GROUP_CHANNEL_IDS||'').split(',').includes(e.channel);
 const fallback=group?'Group meeting':process.env.SLACK_CHANNEL_NAME||'all-wharf';
 const historyPromise=slackHistory(e.channel,e.ts,e.thread_ts);
 const namePromise=Promise.race([
  slackMeetingName(e.channel,group).catch(()=>fallback),
  new Promise<string>(resolve=>{const timer=setTimeout(()=>resolve(fallback),2000);timer.unref?.()})
 ]);
 const [[existing],[context],[usage]]=await Promise.all([
 sql()`SELECT * FROM slack_meetings WHERE team_id=${envelope.team_id} AND channel_id=${e.channel} AND thread_ts=${thread} AND created_at>now()-interval '30 days'`,
 sql()`SELECT messages FROM slack_context WHERE team_id=${envelope.team_id} AND channel_id=${e.channel} AND thread_ts=${thread} AND user_id=${e.user} AND updated_at>now()-interval '1 day'`,
 sql()`SELECT count(*)::int AS n FROM slack_jobs WHERE created_at>date_trunc('day',now()) AND payload->>'team_id'=${envelope.team_id} AND payload->>'type'='event_callback'`
 ]);
 if(existing){if(existing.organizer_id!==e.user){await slackPrivateMessage(e.channel,e.user,'Only the requester can plan this meeting. I’ll ask you privately if your calendar needs connecting.');return}if(slackIntent(e.text)==='schedule'){await reply(existing,'This meeting’s details are fixed. Start a new message with the revised details to create a new meeting. Click to attend this meeting.',[refresh(existing.id)]);return}await status(existing);return}
 const messages=[...(context?.messages||[]),e.text.slice(0,4000)].slice(-6);
 await sql()`INSERT INTO slack_context(team_id,channel_id,thread_ts,user_id,messages) VALUES(${envelope.team_id},${e.channel},${thread},${e.user},${JSON.stringify(messages)}::jsonb) ON CONFLICT(team_id,channel_id,thread_ts,user_id) DO UPDATE SET messages=EXCLUDED.messages,updated_at=now()`;
 // A workspace-level daily cap bounds model spend even when channel members repeatedly mention the bot.
 if(usage.n>100){await slackPrivateMessage(e.channel,e.user,'The daily scheduling limit has been reached. Try again tomorrow.');return}
 const result=await interpretOpenSlackRequest(messages.join('\nFollow-up: ').slice(-12000),process.env.SLACK_DEFAULT_TIMEZONE||'America/Denver',Date.now(),await historyPromise);
 if(!result.draft){await sql()`UPDATE slack_context SET messages=${JSON.stringify([...messages,`Wharf asked: ${result.question}`].slice(-6))}::jsonb,updated_at=now() WHERE team_id=${envelope.team_id} AND channel_id=${e.channel} AND thread_ts=${thread} AND user_id=${e.user}`;await askPrivately(e.channel,e.user,thread,result.question!);return}
 if(!result.requestedTitle)result.draft.title=await namePromise;
 const participants=await channelRoster(e.channel);
 const draft={...result.draft,openJoin:false,participants};
 const id=randomUUID(),cipher=sealToken(randomBytes(32).toString('base64url'),`slack:${id}`);
 const [inserted]=await sql()`INSERT INTO slack_meetings(id,team_id,channel_id,thread_ts,organizer_id,draft,key_cipher) VALUES(${id},${envelope.team_id},${e.channel},${thread},${e.user},${JSON.stringify(draft)}::jsonb,${cipher}) ON CONFLICT DO NOTHING RETURNING *`;
 const row=inserted||(await sql()`SELECT * FROM slack_meetings WHERE team_id=${envelope.team_id} AND channel_id=${e.channel} AND thread_ts=${thread}`)[0];
 await status(row);
 console.info('Slack meeting link delivered',{processingMs:Date.now()-started,messageToLinkMs:Date.now()-Number(e.ts)*1000});
}
async function status(r:any){
 if(!r.meeting_id){await createAndShare(r);return}
 if(r.pending_booking){await bookFromSlack(r);return}
 if(r.draft.openJoin){const m=await getAgentMeeting(r.meeting_id,keyFor(r));await reply(r,m.calendarEventCreated?'The Google Calendar event is created and invitations have been requested.':`${m.responseSummary.responded} people have joined. Availability covers only those people. When the group is ready, reply in this thread: @Wharf book a time that works for us. <${appUrl()}/?meeting=${r.meeting_id}|View meeting>`);return}
 const key=keyFor(r),m=await getAgentMeeting(r.meeting_id,key);
 if(m.calendarEventCreated){await reply(r,'The Google Calendar event is created and invitations have been requested for everyone.');return}
 if(m.status==='awaiting_responses'){await reply(r,`Waiting for ${m.responseSummary.waitingFor.map(id=>`<@${id}>`).join(', ')} to connect their availability.`,[refresh(r.id),slackButton('Share join link','wharf_invites',r.id)]);return}
 if(m.status==='no_overlap'){await reply(r,'No shared time fits. Start a new thread with a wider date range or shorter duration.');return}
 const authorization=await prepareAgentCalendar(r.meeting_id,key,{organizerParticipantId:r.organizer_id});
 if(!authorization.authorized){await slackPrivateMessage(r.channel_id,r.organizer_id,`Authorize Wharf to create one calendar event for “${slackEscape(m.title)}”: ${authorization.authorizationUrl}`);await reply(r,'All participants have responded. Use your private calendar authorization link above. Complete that step, then ask me to check availability.',[refresh(r.id)]);return}
 if(m.finalTime){await reply(r,'The selected time is saved, but calendar delivery needs another attempt.',[slackButton('Retry calendar delivery','wharf_book',JSON.stringify({id:r.id,slotId:m.finalTime.slotId,revision:m.finalTime.basedOnRevision}))]);return}
 const slots=await getAgentSlots(r.meeting_id,key,{limit:3});
 await reply(r,'These times fit everyone. Only the requester can confirm a time. Confirmation creates the calendar event and sends invitations.');
 for(const s of slots.slots){const label=new Date(s.start).toLocaleString('en-US',{timeZone:s.timezone,dateStyle:'medium',timeStyle:'short'});await reply(r,`${label} (${s.timezone}), ${r.draft.durationMinutes} minutes`,[slackButton('Confirm and send invites','wharf_book',JSON.stringify({id:r.id,slotId:s.id,revision:slots.revision}))])}
}
async function createAndShare(r:any){
 const m=await createAgentMeeting(new Request(appUrl()+'/api/v1/meetings',{headers:{authorization:`Bearer ${keyFor(r)}`,'idempotency-key':`slack:${r.id}`}}),r.draft);
 await sql()`UPDATE slack_meetings SET meeting_id=${m.id} WHERE id=${r.id}`;
 r.meeting_id=m.id;
 await enrollRoster(r.draft.participants||[],user=>attendFromSlack(r,{user:{id:user}},true),async user=>{
  await slack('chat.postEphemeral',{channel:r.channel_id,user,text:'You are included in this meeting, but I could not connect your calendar yet. Click Link Google Calendar to retry.',blocks:slackBlocks('You are included in this meeting. Link Google Calendar to share your availability.',[slackButton('Link Google Calendar','wharf_attend',r.id)])}).catch(()=>console.warn('Private calendar prompt could not be delivered'));
 });
 await invitations(r);
 await notifyCalendarsReady(r);
}
async function invitations(r:any){
 // Try saved calendar connections first; announce planning only while someone is missing.
 if(!r.draft.openJoin){const meeting=await getAgentMeeting(r.meeting_id,keyFor(r));if(!meeting.responseSummary.waitingFor.length)return}
 const group=(process.env.SLACK_GROUP_CHANNEL_IDS||'').split(',').includes(r.channel_id);
 const d=r.draft,url=`${appUrl()}/?meeting=${encodeURIComponent(r.meeting_id)}`;
 const text=`I’m on it. Planning a ${d.durationMinutes}-minute meeting ${slackEscape(slackMeetingWhen(d,true))}. ${d.openJoin?'Click to attend so I can find a time that works for everyone.':'I’ll check everyone’s calendars to find a time that works.'}${d.openJoin?`\n\n<${url}|Open calendar on Wharf>`:''}`;
 // Post to the main channel so everyone can find the same invitation.
 const posted=await slackMessage(r.channel_id,text,undefined,slackBlocks(text,d.openJoin?[refresh(r.id)]:[]));
 await sql()`UPDATE slack_meetings SET invitation_ts=${posted.ts} WHERE id=${r.id}`;
 // Membership is only for notification, after the usable link is already visible.
 if(d.openJoin&&group){try{
  const members=await slack('conversations.members',{channel:r.channel_id,limit:100});
  const mentions=members.members.filter((id:string)=>id!==process.env.SLACK_BOT_USER_ID).map((id:string)=>`<@${id}>`).join(' ');
  if(mentions)await slackMessage(r.channel_id,`${mentions}, please <${url}|click to attend> if applicable.`,posted.ts);
 }catch{console.warn('Slack attendance notification failed; meeting link was delivered')}}
}
async function continuePrivateAnswer(team:string,channel:string,thread:string,user:string,answer:string){
 const [context]=await sql()`SELECT 1 FROM slack_context WHERE team_id=${team} AND channel_id=${channel} AND thread_ts=${thread} AND user_id=${user} AND updated_at>now()-interval '1 day'`;
 if(!context||!answer?.trim())return;
 await slackMention({team_id:team,event:{channel,user,thread_ts:thread,ts:String(Date.now()/1000),text:answer.slice(0,4000)}});
}
export async function slackAction(payload:any){
 if(payload.type==='view_submission'){
  const meta=JSON.parse(payload.view.private_metadata||'{}');
  if(meta.team!==payload.team.id||meta.user!==payload.user.id)return;
  await continuePrivateAnswer(meta.team,meta.channel,meta.thread,meta.user,payload.view.state.values.details.answer.value);return;
 }
 const a=payload.actions?.[0];if(!a)return;
 if(a.action_id==='wharf_time_range'||['wharf_preset_workday','wharf_preset_lunchtime','wharf_preset_anytime','wharf_preset_evening'].includes(a.action_id)){
  let selection;try{selection=a.action_id==='wharf_time_range'?timeRangeAnswer(payload):timePresetAnswer(payload)}catch(error){await slackPrivateMessage(payload.channel.id,payload.user.id,(error as Error).message);return}
  await continuePrivateAnswer(payload.team.id,payload.channel.id,selection.thread,payload.user.id,selection.answer);return;
 }
 if(/^wharf_duration_(15|30|45|60)$/.test(a.action_id)){const value=JSON.parse(a.value);if(![15,30,45,60].includes(value.minutes))return;await continuePrivateAnswer(payload.team.id,payload.channel.id,value.thread,payload.user.id,`${value.minutes} minutes`);return}
 const value=a.action_id==='wharf_book'?JSON.parse(a.value):{id:a.value};
 const [r]=await sql()`SELECT * FROM slack_meetings WHERE id=${value.id} AND created_at>now()-interval '30 days'`;
 if(r&&['wharf_attend','wharf_status'].includes(a.action_id)){
  if(!canAttendSlackMeeting(r,payload.team.id,payload.channel.id,payload.user.id)){await slack('chat.postEphemeral',{channel:payload.channel.id,user:payload.user.id,text:'This invitation is not available to your Slack account.'});return}
  try{await attendFromSlack(r,payload)}catch{await slack('chat.postEphemeral',{channel:payload.channel.id,user:payload.user.id,text:'Could not join this meeting. It may already be confirmed or expired. Please try again if it is still open.'})}return;
 }
 if(!r||!canControlMeeting({team_id:r.team_id,channel_id:r.channel_id,organizer_id:r.organizer_id},payload.team.id,payload.channel.id,payload.user.id)){await slack('chat.postEphemeral',{channel:payload.channel.id,user:payload.user.id,text:'Only the original requester can control this meeting.'});return}
 if(a.action_id==='wharf_create'){await createAndShare(r);
 }else if(a.action_id==='wharf_invites'&&r.meeting_id)await invitations(r);
 else if(a.action_id==='wharf_status')await status(r);
 else if(a.action_id==='wharf_book'&&r.meeting_id){await confirmSuggestedTime(r,value)}
}

async function confirmSuggestedTime(r:any,choice:{slotId:string;revision:number}){
 const key=keyFor(r),organizer=await slackOrganizer(r);
 if(!organizer){await reply(r,'Connect your Google Calendar before booking.',[refresh(r.id)]);return}
 let auth=await prepareAgentCalendar(r.meeting_id,key,{organizerParticipantId:organizer.participantId});
 if(!auth.authorized&&await hasAgentCalendarPermission(organizer.sub)){
  await authorizeAgentCalendar(r.meeting_id,organizer.participantId,organizer.sub);auth={...auth,authorized:true};
 }
 if(!auth.authorized){await reply(r,`<${auth.authorizationUrl}|Allow Google Calendar invitations>, then press Book meeting again to confirm this time.`);return}
 await refreshAgentAvailability(r.meeting_id,key);
 const row=await loadAgentMeeting(r.meeting_id,key);
 if(row.final_time){
  if(row.final_time.slotId!==choice.slotId){await reply(r,'This meeting already has a different confirmed time.');return}
  await bookAgentMeeting(r.meeting_id,key,{slotId:choice.slotId,revision:row.final_time.basedOnRevision});
 }else{
  const view=await getAgentMeeting(r.meeting_id,key);
  if(view.responseSummary.waitingFor.length){await reply(r,'Some attendees still need to connect their calendars before I can book.');return}
  const slot=meetingSlots(r.meeting_id,JSON.parse(row.constraints),row.people).find(s=>s.id===choice.slotId);
  if(!slot){await reply(r,'That time is no longer available. Here is the next earliest option.');await suggestEarliestSlackTime(r);return}
  await bookAgentMeeting(r.meeting_id,key,{slotId:slot.id,revision:Number(row.revision)});
 }
 await status(r);
}

async function slackOrganizer(r:any){
 const row=await loadAgentMeeting(r.meeting_id,keyFor(r));
 const [identity]=await sql()`SELECT a.google_sub FROM slack_google_accounts a JOIN sessions s ON s.id=a.session_id AND s.google_sub=a.google_sub WHERE a.team_id=${r.team_id} AND a.user_id=${r.organizer_id} AND s.expires_at>now()`;
 if(!identity)return null;
 const person=row.invitees.find((p:any)=>p.googleSub===identity.google_sub&&row.people.some((a:any)=>a.googleSub===p.googleSub));
 return person?{participantId:person.id,sub:identity.google_sub}:null;
}
async function bookFromSlack(r:any){
 if(!r.meeting_id){await reply(r,'This meeting is still being prepared. Try again shortly.');return}
 const [stored]=await sql()`SELECT agent_request_id FROM requests WHERE id=${r.meeting_id}`;
 if(!stored?.agent_request_id){await reply(r,`This older meeting uses the website booking flow. <${appUrl()}/?meeting=${r.meeting_id}|Open the meeting> to finish it. New meetings support booking here in Slack.`);return}
 let organizer:{participantId:string;sub:string}|null=null;
 const result=await runSlackBooking({
  read:()=>getAgentMeeting(r.meeting_id,keyFor(r)),
  refresh:()=>refreshAgentAvailability(r.meeting_id,keyFor(r)),
  organizer:async()=>{organizer=await slackOrganizer(r);return organizer?.participantId||null},
  authorize:async participant=>{
   let auth=await prepareAgentCalendar(r.meeting_id,keyFor(r),{organizerParticipantId:participant});
   // The authenticated Slack request authorizes this meeting only on the requester's
   // linked, joined Google identity. Google event-write consent remains mandatory.
   if(!auth.authorized&&organizer&&await hasAgentCalendarPermission(organizer.sub)){
    await authorizeAgentCalendar(r.meeting_id,participant,organizer.sub);
    auth={...auth,authorized:true};
   }
   return auth;
  },
  slots:()=>getAgentSlots(r.meeting_id,keyFor(r),{limit:1}),
  book:choice=>bookAgentMeeting(r.meeting_id,keyFor(r),choice),
  pending:async value=>{await sql()`UPDATE slack_meetings SET pending_booking=${value} WHERE id=${r.id}`}
 });
 const m=result.meeting;
 if(result.kind==='booked'){
  const when=m.finalTime?.start?new Date(m.finalTime.start).toLocaleString('en-US',{timeZone:m.constraints.zone,dateStyle:'medium',timeStyle:'short'}):'the confirmed time';
  await reply(r,`Booked ${when} (${m.constraints.zone}). Google Calendar invitations were requested for the ${m.responseSummary.responded} people who joined.`);
 }else if(result.kind==='consent'){
  await slackPrivateMessage(r.channel_id,r.organizer_id,`Allow Google Calendar invitations for “${slackEscape(m.title)}”: ${result.authorizationUrl} . Your requested booking will continue automatically after authorization.`);
  await reply(r,'Use your private Google Calendar authorization link above. After approval, I will refresh the joined attendees’ calendars and book the earliest shared time.');
 }else if(result.kind==='waiting')await reply(r,`I cannot book yet. ${m.responseSummary.responded} people have joined${m.responseSummary.waitingFor.length?`; still waiting for ${m.responseSummary.waitingFor.map((id:string)=>`<@${id}>`).join(', ')}`:''}. Ask the intended attendees to click to attend, then ask me to book again. I can only include people who actually joined.`,[refresh(r.id)]);
 else if(result.kind==='organizer_missing')await reply(r,'The requester must click to attend with their Google account before I can book on their calendar.',[refresh(r.id)]);
 else if(result.kind==='no_overlap')await reply(r,'I refreshed the joined attendees’ calendars, but no future time fits everyone in this meeting’s window. Ask for a new meeting with a wider window or shorter duration.');
 else if(result.kind==='web_finalized')await reply(r,`This meeting already has a selected time. <${appUrl()}/?meeting=${r.meeting_id}|Open the meeting> to see its calendar delivery status.`);
 else await reply(r,'The time is saved, but calendar delivery is not confirmed yet. Ask me to book again to retry the same event without creating a duplicate.');
}
export async function resumeSlackBooking(meetingId:string){
 try{
  const rows=await sql()`SELECT * FROM slack_meetings WHERE meeting_id=${meetingId} AND pending_booking=true AND created_at>now()-interval '30 days'`;
  for(const r of rows)await bookFromSlack(r);
 }catch(error){
  console.error('Slack booking resume failed',{code:error instanceof AgentError?error.code:'integration_error'});
  try{const rows=await sql()`SELECT * FROM slack_meetings WHERE meeting_id=${meetingId} AND pending_booking=true`;
  for(const r of rows)await reply(r,error instanceof AgentError?`${slackEscape(error.message)} ${slackEscape(error.nextAction)}`:'Calendar authorization succeeded, but booking could not finish. Ask me to book again to retry.')}catch{console.error('Slack booking resume notification failed')}
 }
}

export async function runSlackJob(id:string){
 const started=Date.now();
 const [job]=await sql()`UPDATE slack_jobs SET status='running',lease_until=now()+interval '3 minutes',attempts=attempts+1 WHERE id=${id} AND status<>'done' AND (lease_until IS NULL OR lease_until<now()) AND attempts<3 RETURNING *`;
 if(!job)return;
 try{if(job.payload.type==='event_callback')await slackMention(job.payload);else await slackAction(job.payload);await sql()`UPDATE slack_jobs SET status='done',payload=jsonb_build_object('team_id',payload->>'team_id','type',payload->>'type') WHERE id=${id}`}
 catch(error){await sql()`UPDATE slack_jobs SET status='failed',lease_until=NULL WHERE id=${id}`;const p=job.payload,e=p.event;const meta=p.type==='view_submission'?JSON.parse(p.view.private_metadata||'{}'):null;const channel=e?.channel||p.channel?.id||meta?.channel,thread=e?.thread_ts||e?.ts||p.message?.thread_ts||p.message?.ts||meta?.thread;if(meta&&channel)await askPrivately(channel,p.user.id,thread,'I could not process that answer. Please try again.');else if(channel&&(e?.user||p.user?.id))await slackPrivateMessage(channel,e?.user||p.user.id,error instanceof AgentError?`${slackEscape(error.message)} ${slackEscape(error.nextAction)}`:'I could not complete that step. Try the button again or mention me again. If it continues, ask the workspace owner to check the bot configuration.');console.error('Slack workflow failed',{jobId:id,code:error instanceof AgentError?error.code:'integration_error',errorType:error instanceof Error?error.name:'unknown',durationMs:Date.now()-started})}
 finally{console.info('Slack job finished',{jobId:id,durationMs:Date.now()-started})}
}
