import {sql} from './auth';
import {openToken} from './token-vault';
import {inSlackWorkspace} from './slack-installations';
import {slackMention,slackAction} from './slack-workflow';
import {withDiscordInteraction,type DiscordInteraction} from './discord-context';
import {discordTransport} from './discord-client';
export async function runDiscordJob(id:string){
 const [job]=await sql()`UPDATE slack_jobs SET status='running',lease_until=now()+interval '3 minutes',attempts=attempts+1 WHERE id=${id} AND status IN ('pending','running') AND (lease_until IS NULL OR lease_until<now()) AND attempts<3 RETURNING *`;
 if(!job)return;
 const {interaction:sealed,...data}=job.payload;
 const context:DiscordInteraction=JSON.parse(openToken(sealed,`discord-job:${id}`));
 return inSlackWorkspace(data.team_id,()=>withDiscordInteraction(context,async()=>{
  try{
   if(data.type==='event_callback')await slackMention(data);else await slackAction(data);
   if(!context.responded)await discordTransport('chat.postEphemeral',{channel:context.channel_id,user:context.userId,text:'Done. Check the meeting message and your private calendar prompts.'});
   await sql()`UPDATE slack_jobs SET status='done',lease_until=NULL,payload=${JSON.stringify({team_id:data.team_id,type:data.type})}::jsonb WHERE id=${id}`;
  }catch{
   // Do not blindly repeat model/booking work after partial delivery. A fresh command or button retries using the shared idempotency guards.
   await sql()`UPDATE slack_jobs SET status='failed',lease_until=NULL,payload=${JSON.stringify({team_id:data.team_id,type:data.type})}::jsonb WHERE id=${id}`;
   await discordTransport('chat.postEphemeral',{channel:context.channel_id,user:context.userId,text:'I could not finish that step. Check that Wharf can send messages here and attendees allow direct messages. Try the button again, or run /wharf again.'}).catch(()=>console.warn('Discord private error delivery failed'));
   console.error('Discord workflow failed',{jobId:id});
  }
 }));
}
