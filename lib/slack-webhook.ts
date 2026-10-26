import {createHash} from 'node:crypto';
import {after} from 'next/server';
import {sql} from './auth';
import {verifySlackSignature} from './slack-security';
import {runSlackJob} from './slack-workflow';
export async function slackWebhook(req:Request,interactive=false){
 const secret=process.env.SLACK_SIGNING_SECRET,team=process.env.SLACK_TEAM_ID,channel=process.env.SLACK_CHANNEL_ID;
 if(!secret||!team||!channel||!process.env.SLACK_BOT_TOKEN||!process.env.ANTHROPIC_API_KEY)return new Response('Slack is not configured',{status:503});
 if(Number(req.headers.get('content-length'))>65536)return new Response('Too large',{status:413});
 const raw=await req.text();if(Buffer.byteLength(raw)>65536)return new Response('Too large',{status:413});
 if(!verifySlackSignature(raw,req.headers.get('x-slack-request-timestamp'),req.headers.get('x-slack-signature'),secret))return new Response('Invalid signature',{status:401});
 let payload:any;try{payload=JSON.parse(interactive?new URLSearchParams(raw).get('payload')||'':raw)}catch{return new Response('Invalid payload',{status:400})}
 if(payload.type==='url_verification'&&!interactive)return Response.json({challenge:payload.challenge});
 if((interactive?payload.team?.id:payload.team_id)!==team)return new Response('Wrong workspace',{status:403});
 if(interactive){if(payload.type!=='block_actions'||payload.channel?.id!==channel||!payload.user?.id||!['wharf_create','wharf_status','wharf_invites','wharf_book'].includes(payload.actions?.[0]?.action_id))return new Response('Ignored')}
 else {const e=payload.event;if(payload.type!=='event_callback'||e?.type!=='app_mention'||e.bot_id||e.subtype||e.channel!==channel||!e.user||!e.text||!payload.event_id)return new Response('Ignored')}
 const id=interactive?createHash('sha256').update(raw).digest('hex'):payload.event_id;
 // Persist before acknowledging. Slack retries failed HTTP deliveries; unique IDs deduplicate retries.
 try{await sql()`INSERT INTO slack_jobs(id,payload) VALUES(${id},${JSON.stringify(payload)}::jsonb) ON CONFLICT DO NOTHING`}catch{return new Response('Retry later',{status:503})}
 after(()=>runSlackJob(id));return new Response('');
}
