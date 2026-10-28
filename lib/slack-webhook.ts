import {openPrivateAnswer} from './slack-clarification';
import {createHash} from 'node:crypto';
import {after} from 'next/server';
import {sql} from './auth';
import {verifySlackSignature,allowedSlackChannel} from './slack-security';
import {runSlackJob} from './slack-workflow';
export async function slackWebhook(req:Request,interactive=false){
 const secret=process.env.SLACK_SIGNING_SECRET,team=process.env.SLACK_TEAM_ID,channel=process.env.SLACK_CHANNEL_ID;
 if(!secret||!team||!channel||!process.env.SLACK_BOT_TOKEN||!process.env.ANTHROPIC_API_KEY||(process.env.SLACK_INTERPRETER==='jev'&&!process.env.TYPESAFE_API_KEY))return new Response('Slack is not configured',{status:503});
 if(Number(req.headers.get('content-length'))>65536)return new Response('Too large',{status:413});
 const raw=await req.text();if(Buffer.byteLength(raw)>65536)return new Response('Too large',{status:413});
 if(!verifySlackSignature(raw,req.headers.get('x-slack-request-timestamp'),req.headers.get('x-slack-signature'),secret))return new Response('Invalid signature',{status:401});
 let payload:any;try{payload=JSON.parse(interactive?new URLSearchParams(raw).get('payload')||'':raw)}catch{return new Response('Invalid payload',{status:400})}
 if(payload.type==='url_verification'&&!interactive)return Response.json({challenge:payload.challenge});
 if((interactive?payload.team?.id:payload.team_id)!==team)return new Response('Wrong workspace',{status:403});
 if(interactive&&payload.type==='view_submission'){
 let meta:any;try{meta=JSON.parse(payload.view?.private_metadata||'{}')}catch{return new Response('Invalid details',{status:400})}
 if(payload.view?.callback_id!=='wharf_details'||meta.team!==team||meta.user!==payload.user?.id||!allowedSlackChannel(meta.channel))return new Response('Invalid details',{status:403});
 }else if(interactive){if(payload.type!=='block_actions'||!allowedSlackChannel(payload.channel?.id)||!payload.user?.id||!['wharf_confirm_details','wharf_preset_workday','wharf_preset_lunchtime','wharf_preset_anytime','wharf_preset_evening','wharf_time_range','wharf_range_start','wharf_range_end','wharf_range_day','wharf_answer','wharf_duration_15','wharf_duration_30','wharf_duration_45','wharf_duration_60','wharf_attend','wharf_create','wharf_status','wharf_invites','wharf_book'].includes(payload.actions?.[0]?.action_id))return new Response('Ignored')}
 else {const e=payload.event;if(payload.type!=='event_callback'||!['app_mention','message'].includes(e?.type)||e.bot_id||e.subtype||!allowedSlackChannel(e.channel)||(e.type==='message'&&e.channel_type!=='mpim')||!e.user||!e.text||!e.ts||!payload.event_id)return new Response('Ignored')}
 if(!interactive&&payload.event.type==='message'){const e=payload.event;if(!process.env.SLACK_BOT_USER_ID||!e.text.includes(`<@${process.env.SLACK_BOT_USER_ID}>`)){
 // Only the requester can continue a recent, already-started scheduling thread without mentioning the bot.
 if(!e.thread_ts)return new Response('Ignored: mention Wharf to respond');
 const [context]=await sql()`SELECT 1 FROM slack_context WHERE team_id=${payload.team_id} AND channel_id=${e.channel} AND thread_ts=${e.thread_ts} AND user_id=${e.user} AND updated_at>now()-interval '1 day'`;
 if(!context)return new Response('Ignored: no active scheduling thread');
 }}
 if(interactive&&['wharf_range_start','wharf_range_end','wharf_range_day'].includes(payload.actions?.[0]?.action_id))return new Response('');
 if(interactive&&payload.actions?.[0]?.action_id==='wharf_answer'){await openPrivateAnswer(payload);return new Response('')}
 const id=interactive?createHash('sha256').update(raw).digest('hex'):createHash('sha256').update([payload.team_id,payload.event.channel,payload.event.ts].join(':')).digest('hex');
 // Persist before acknowledging. Slack retries failed HTTP deliveries; unique IDs deduplicate retries.
 try{await sql()`INSERT INTO slack_jobs(id,payload) VALUES(${id},${JSON.stringify(payload)}::jsonb) ON CONFLICT DO NOTHING`}catch{return new Response('Retry later',{status:503})}
 after(()=>runSlackJob(id));return new Response('');
}
