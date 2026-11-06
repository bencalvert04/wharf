import {randomUUID} from 'node:crypto';
import {sql} from './auth';
import {currentSlackWorkspace} from './slack-context';
import {currentDiscordInteraction} from './discord-context';
import {discordText,validDiscordId} from './discord-security';
export async function discordApi(path:string,body?:unknown,method=body?'POST':'GET',webhook=false):Promise<any>{
 const response=await fetch(`https://discord.com/api/v10/${path}`,{method,headers:{...(!webhook?{Authorization:`Bot ${process.env.DISCORD_BOT_TOKEN}`} : {}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error(`Discord API failed (${response.status})`);
 return response.status===204?{}:response.json();
}
export async function storeDiscordComponent(channel:string,user:string|null,action:string,value:string,participants:string[]=[],timezone?:string){
 const id=randomUUID(),team=currentSlackWorkspace()?.teamId;if(!team)throw Error('Missing Discord server context');
 await sql()`INSERT INTO discord_components(id,team_id,channel_id,user_id,action,value,participants,timezone) VALUES(${id},${team},${channel},${user},${action},${value},${JSON.stringify(participants)}::jsonb,${timezone||process.env.DISCORD_DEFAULT_TIMEZONE||'America/Denver'})`;
 return `wharf:${id}`;
}
async function messageBody(body:Record<string,any>,privateUser:string|null){
 const context=currentDiscordInteraction();
 const buttons=(body.blocks||[]).flatMap((block:any)=>block.type==='actions'?block.elements||[]:[]).filter((b:any)=>b.type==='button');
 const components:any[]=[];
 // Slack's date picker has no direct Discord equivalent. Use a modal answer for missing-day questions.
 const needsDay=(body.blocks||[]).some((b:any)=>b.elements?.some((e:any)=>e.type==='datepicker'));
 for(const button of buttons){
  if(needsDay&&button.action_id!=='wharf_answer')continue;
  if(button.url){components.push({type:2,style:5,label:button.text.text.slice(0,80),url:button.url});continue}
  const id=await storeDiscordComponent(String(body.channel),privateUser,button.action_id,button.value,context?.participants,context?.timezone);
  components.push({type:2,style:1,label:(button.action_id==='wharf_attend'?'Connect calendar privately':button.text.text).slice(0,80),custom_id:id});
 }
 const content=discordText(String(body.text||'Wharf')).slice(0,2000);
 return {content,allowed_mentions:{parse:[]},components:Array.from({length:Math.ceil(components.length/5)},(_,i)=>({type:1,components:components.slice(i*5,i*5+5)})).slice(0,5)};
}
/** Platform adapter. The scheduling, identity, consent and booking workflow remains shared with Slack. */
export async function discordTransport(method:string,body:Record<string,any>):Promise<any>{
 const context=currentDiscordInteraction();
 if(method==='users.info'){
  if(!validDiscordId(body.user))throw Error('Invalid Discord user');
  const data=await discordApi(`users/${body.user}`);
  return {user:{id:data.id,name:data.username,real_name:data.global_name||data.username,is_bot:!!data.bot,tz:context?.timezone||process.env.DISCORD_DEFAULT_TIMEZONE||'America/Denver'}};
 }
 if(method==='conversations.members')return {members:context?.participants||[],response_metadata:{next_cursor:''}};
 if(method==='conversations.info'){const data=await discordApi(`channels/${body.channel}`);return {channel:{name:data.name||'Group meeting'}}}
 if(method==='conversations.open'){const data=await discordApi('users/@me/channels',{recipient_id:body.users});return {channel:{id:data.id}}}
 if(method==='chat.postMessage'||method==='chat.postEphemeral'){
  const privateUser=method==='chat.postEphemeral'?String(body.user):null;
  const message=await messageBody(body,privateUser);
  let data;
  if(privateUser&&context?.userId===privateUser){
   const path=`webhooks/${context.application_id}/${context.token}`;
   if(!context.responded){data=await discordApi(`${path}/messages/@original`,message,'PATCH',true);context.responded=true}
   else data=await discordApi(path,{...message,flags:64},'POST',true);
  }else{
   const channel=privateUser?(await discordApi('users/@me/channels',{recipient_id:privateUser})).id:body.channel;
   data=await discordApi(`channels/${channel}/messages`,message);
  }
  return {ok:true,ts:data.id,channel:data.channel_id};
 }
 throw Error(`Unsupported Discord transport operation: ${method}`);
}
