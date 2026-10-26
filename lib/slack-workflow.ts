import {randomUUID,randomBytes} from 'node:crypto';
import {sql,appUrl} from './auth';
import {sealToken,openToken} from './token-vault';
import {createAgentMeeting,getAgentMeeting,getAgentSlots,AgentError} from './agent-api';
import {prepareAgentCalendar,bookAgentMeeting} from './agent-booking';
import {interpretSlackRequest} from './slack-agent';
import {slackMentions,slackEscape,canControlMeeting} from './slack-security';
import {slack,slackMessage,slackDM,slackBlocks,slackButton} from './slack-client';
const keyFor=(r:any)=>openToken(r.key_cipher,`slack:${r.id}`);
const reply=(r:any,text:string,buttons:unknown[]=[])=>slackMessage(r.channel_id,text,r.thread_ts,buttons.length?slackBlocks(text,buttons):undefined);
const refresh=(id:string)=>slackButton('Check availability','wharf_status',id);

export async function slackMention(envelope:any){
 const e=envelope.event,thread=e.thread_ts||e.ts;
 const [existing]=await sql()`SELECT * FROM slack_meetings WHERE team_id=${envelope.team_id} AND channel_id=${e.channel} AND thread_ts=${thread} AND created_at>now()-interval '30 days'`;
 if(existing){if(existing.organizer_id!==e.user){await reply(existing,'The requester controls this meeting. Use the shared join link in the channel to share availability.');return}await status(existing);return}
 const auth=await slack('auth.test',{});
 const participants=[...new Set([e.user,...slackMentions(e.text).filter(id=>id!==auth.user_id)])];
 if(participants.length<2){await slackMessage(e.channel,'Mention the people to invite, plus a date range. For example: “Schedule 30 minutes with @Ray next week.”',thread);return}
 if(participants.length>20){await slackMessage(e.channel,'Please invite at most 20 people.',thread);return}
 // A workspace-level daily cap bounds model spend even when channel members repeatedly mention the bot.
 const [usage]=await sql()`SELECT count(*)::int AS n FROM slack_jobs WHERE created_at>date_trunc('day',now()) AND payload->>'team_id'=${envelope.team_id} AND payload->>'type'='event_callback'`;
 if(usage.n>100){await slackMessage(e.channel,'The daily scheduling limit has been reached. Try again tomorrow.',thread);return}
 const owner=await slack('users.info',{user:e.user});
 const result=await interpretSlackRequest(e.text,e.user,participants,owner.user.tz||'UTC');
 if(!result.draft){await slackMessage(e.channel,slackEscape(result.question!),thread);return}
 // Resolve names only from Slack; neither user text nor the model controls the recipient IDs.
 for(const p of result.draft.participants){const u=await slack('users.info',{user:p.id});if(u.user.deleted||u.user.is_bot)throw Error('Invite active people, not bots');p.name=(u.user.real_name||u.user.name||p.id).slice(0,100)}
 const id=randomUUID(),cipher=sealToken(randomBytes(32).toString('base64url'),`slack:${id}`);
 await sql()`INSERT INTO slack_meetings(id,team_id,channel_id,thread_ts,organizer_id,draft,key_cipher) VALUES(${id},${envelope.team_id},${e.channel},${thread},${e.user},${JSON.stringify(result.draft)}::jsonb,${cipher}) ON CONFLICT DO NOTHING`;
 const [row]=await sql()`SELECT * FROM slack_meetings WHERE team_id=${envelope.team_id} AND channel_id=${e.channel} AND thread_ts=${thread}`;
 await status(row);
}
async function status(r:any){
 if(!r.meeting_id){await createAndShare(r);return}
 const key=keyFor(r),m=await getAgentMeeting(r.meeting_id,key);
 if(m.calendarEventCreated){await reply(r,'The Google Calendar event is created and invitations have been requested for everyone.');return}
 if(m.status==='awaiting_responses'){await reply(r,`Waiting for ${m.responseSummary.waitingFor.map(id=>`<@${id}>`).join(', ')} to connect their availability.`,[refresh(r.id),slackButton('Share join link','wharf_invites',r.id)]);return}
 if(m.status==='no_overlap'){await reply(r,'No shared time fits. Start a new thread with a wider date range or shorter duration.');return}
 const authorization=await prepareAgentCalendar(r.meeting_id,key,{organizerParticipantId:r.organizer_id});
 if(!authorization.authorized){await slackDM(r.organizer_id,`Authorize Wharf to create one calendar event for “${slackEscape(m.title)}”: ${authorization.authorizationUrl}`);await reply(r,'All participants have responded. I sent the requester a private calendar authorization link. Complete that step, then check availability.',[refresh(r.id)]);return}
 if(m.finalTime){await reply(r,'The selected time is saved, but calendar delivery needs another attempt.',[slackButton('Retry calendar delivery','wharf_book',JSON.stringify({id:r.id,slotId:m.finalTime.slotId,revision:m.finalTime.basedOnRevision}))]);return}
 const slots=await getAgentSlots(r.meeting_id,key,{limit:3});
 await reply(r,'These times fit everyone. Only the requester can confirm a time. Confirmation creates the calendar event and sends invitations.');
 for(const s of slots.slots){const label=new Date(s.start).toLocaleString('en-US',{timeZone:s.timezone,dateStyle:'medium',timeStyle:'short'});await reply(r,`${label} (${s.timezone}), ${r.draft.durationMinutes} minutes`,[slackButton('Confirm and send invites','wharf_book',JSON.stringify({id:r.id,slotId:s.id,revision:slots.revision}))])}
}
async function createAndShare(r:any){
 const m=await createAgentMeeting(new Request(appUrl()+'/api/v1/meetings',{headers:{authorization:`Bearer ${keyFor(r)}`,'idempotency-key':`slack:${r.id}`}}),r.draft);
 await sql()`UPDATE slack_meetings SET meeting_id=${m.id} WHERE id=${r.id}`;
 r.meeting_id=m.id;
 await invitations(r);
}
async function invitations(r:any){
 const d=r.draft,url=`${appUrl()}/slack/join/${r.id}`;
 const text=`*${slackEscape(d.title)}*\n${d.durationMinutes} minutes · ${d.startDate} to ${d.endDate||d.startDate}\n${d.dayStart}–${d.dayEnd} (${slackEscape(d.timezone)})\n${d.participants.map((p:any)=>`<@${p.id}>`).join(', ')}\n<${url}|Join the meeting> · Choose your name and connect your availability.`;
 // Post to the main channel so everyone can find the same invitation.
 await slackMessage(r.channel_id,text,undefined,slackBlocks(text,[refresh(r.id)]));
}
export async function slackAction(payload:any){
 const a=payload.actions?.[0];if(!a)return;
 const value=a.action_id==='wharf_book'?JSON.parse(a.value):{id:a.value};
 const [r]=await sql()`SELECT * FROM slack_meetings WHERE id=${value.id} AND created_at>now()-interval '30 days'`;
 if(!r||!canControlMeeting({team_id:r.team_id,channel_id:r.channel_id,organizer_id:r.organizer_id},payload.team.id,payload.channel.id,payload.user.id)){await slack('chat.postEphemeral',{channel:payload.channel.id,user:payload.user.id,text:'Only the original requester can control this meeting.'});return}
 if(a.action_id==='wharf_create'){await createAndShare(r);
 }else if(a.action_id==='wharf_invites'&&r.meeting_id)await invitations(r);
 else if(a.action_id==='wharf_status')await status(r);
 else if(a.action_id==='wharf_book'&&r.meeting_id){await bookAgentMeeting(r.meeting_id,keyFor(r),{slotId:value.slotId,revision:value.revision});await status(r)}
}
export async function runSlackJob(id:string){
 const [job]=await sql()`UPDATE slack_jobs SET status='running',lease_until=now()+interval '3 minutes',attempts=attempts+1 WHERE id=${id} AND status<>'done' AND (lease_until IS NULL OR lease_until<now()) AND attempts<3 RETURNING *`;
 if(!job)return;
 try{if(job.payload.type==='event_callback')await slackMention(job.payload);else await slackAction(job.payload);await sql()`UPDATE slack_jobs SET status='done',payload=jsonb_build_object('team_id',payload->>'team_id','type',payload->>'type') WHERE id=${id}`}
 catch(error){await sql()`UPDATE slack_jobs SET status='failed',lease_until=NULL WHERE id=${id}`;const p=job.payload,e=p.event;const channel=e?.channel||p.channel?.id,thread=e?.thread_ts||e?.ts||p.message?.thread_ts||p.message?.ts;if(channel)await slackMessage(channel,error instanceof AgentError?`${slackEscape(error.message)} ${slackEscape(error.nextAction)}`:'I could not complete that step. Try the button again or mention me again. If it continues, ask the workspace owner to check the bot configuration.',thread);console.error('Slack workflow failed',error instanceof AgentError?error.code:'integration_error')}
}
