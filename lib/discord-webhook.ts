import {after} from 'next/server';
import {sql} from './auth';
import {sealToken} from './token-vault';
import {verifyDiscordSignature,validDiscordId,canUseDiscordComponent} from './discord-security';
import {runDiscordJob} from './discord-workflow';
const privateReply=(content:string)=>Response.json({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
export async function discordWebhook(req:Request){
 const publicKey=process.env.DISCORD_PUBLIC_KEY;
 if(!publicKey)return new Response('Discord is not configured',{status:503});
 if(Number(req.headers.get('content-length'))>65536)return new Response('Too large',{status:413});
 const raw=await req.text();if(Buffer.byteLength(raw)>65536)return new Response('Too large',{status:413});
 if(!verifyDiscordSignature(raw,req.headers.get('x-signature-timestamp'),req.headers.get('x-signature-ed25519'),publicKey))return new Response('Invalid signature',{status:401});
 let p:any;try{p=JSON.parse(raw)}catch{return new Response('Invalid JSON',{status:400})}
 if(p.application_id!==process.env.DISCORD_APPLICATION_ID)return new Response('Wrong application',{status:403});
 if(p.type===1)return Response.json({type:1});
 if(!process.env.DISCORD_BOT_TOKEN)return privateReply('Discord setup is not complete yet.');
 const user=p.member?.user?.id||p.user?.id;
 if(!validDiscordId(user)||!validDiscordId(p.id)||!validDiscordId(p.channel_id)||typeof p.token!=='string')return new Response('Invalid interaction',{status:400});
 let team=`discord:${p.guild_id}`,channel=p.channel_id,participants:string[]=[user],timezone=process.env.DISCORD_DEFAULT_TIMEZONE||'America/Denver',payload:any;
 if(p.type===2&&p.data?.name==='wharf'){
  if(!validDiscordId(p.guild_id))return privateReply('Use /wharf in a server channel.');
  const options=p.data.options||[];
  const text=options.find((o:any)=>o.name==='request')?.value;
  if(typeof text!=='string'||!text.trim()||text.length>4000)return privateReply('Include a scheduling request of up to 4,000 characters.');
  const selected=options.filter((o:any)=>/^attendee_[1-4]$/.test(o.name));
  for(const item of selected){
   if(!validDiscordId(item.value)||!p.data.resolved?.members?.[item.value]||p.data.resolved?.users?.[item.value]?.bot)return privateReply('Select human attendees from this server.');
   participants.push(item.value);
  }
  participants=[...new Set(participants)];
  const requestedZone=options.find((o:any)=>o.name==='timezone')?.value;
  if(requestedZone){try{new Intl.DateTimeFormat('en',{timeZone:requestedZone});timezone=requestedZone}catch{return privateReply('Use an IANA timezone, such as America/Denver or Europe/London.')}}
  payload={type:'event_callback',team_id:team,event:{channel,user,text,ts:String(Date.now()/1000)}};
 }else if([3,5].includes(p.type)){
  const custom=p.data?.custom_id;
  if(typeof custom!=='string'||!/^wharf:[a-f\d-]{36}$/.test(custom))return privateReply('This is not a Wharf action.');
  const [component]=await sql()`SELECT * FROM discord_components WHERE id=${custom.slice(6)} AND expires_at>now()`;
  if(!component||!canUseDiscordComponent(component,p))return privateReply('This action has expired or belongs to another person or channel.');
  team=component.team_id;channel=component.channel_id;participants=component.participants;timezone=component.timezone;
  if(component.action==='wharf_answer'&&p.type===3){
   return Response.json({type:9,data:{custom_id:custom,title:'Meeting details',components:[{type:1,components:[{type:4,custom_id:'answer',label:'Your answer',style:2,required:true,max_length:2000,placeholder:'For example: tomorrow, 30 minutes, 10 AM to 4 PM'}]}]}});
  }
  if(p.type===5){
   if(component.action!=='wharf_answer')return privateReply('Invalid answer form.');
   const answer=p.data.components?.flatMap((r:any)=>r.components||[]).find((c:any)=>c.custom_id==='answer')?.value;
   if(typeof answer!=='string'||!answer.trim()||answer.length>2000)return privateReply('Enter your meeting details.');
   payload={type:'view_submission',team_id:team,team:{id:team},user:{id:user},view:{private_metadata:JSON.stringify({team,channel,user,thread:component.value}),state:{values:{details:{answer:{value:answer}}}}}};
  }else payload={type:'block_actions',team_id:team,team:{id:team},channel:{id:channel},user:{id:user},actions:[{action_id:component.action,value:component.value}]};
 }else return privateReply('Use /wharf to schedule a meeting.');
 const id=`discord:${p.id}`;
 const context={id:p.id,application_id:p.application_id,token:p.token,guild_id:team.slice(8),channel_id:channel,userId:user,participants,timezone};
 // The interaction token is a short-lived credential and is encrypted before persistence.
 const stored={...payload,interaction:sealToken(JSON.stringify(context),`discord-job:${id}`)};
 try{
  const [usage]=await sql()`SELECT count(*)::int AS n FROM slack_jobs WHERE created_at>date_trunc('day',now()) AND payload->>'team_id'=${team} AND payload->>'type'='event_callback'`;
  if(p.type===2&&usage.n>=100)return privateReply('This server has reached its daily scheduling limit. Try again tomorrow.');
  await sql()`INSERT INTO slack_jobs(id,payload) VALUES(${id},${JSON.stringify(stored)}::jsonb) ON CONFLICT DO NOTHING`;
 }catch{return new Response('Retry later',{status:503})}
 after(()=>runDiscordJob(id));
 return Response.json({type:5,data:{flags:64}});
}
