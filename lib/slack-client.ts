export async function slack(method:string,body:Record<string,unknown>,attempt=0):Promise<any>{
 const response=await fetch(`https://slack.com/api/${method}`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SLACK_BOT_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 if(response.status===429&&attempt<2){const delay=Math.min(5,Math.max(1,Number(response.headers.get('retry-after'))||1));await new Promise(resolve=>setTimeout(resolve,delay*1000));return slack(method,body,attempt+1)}
 const data=await response.json();if(!response.ok||!data.ok)throw Error(`Slack ${method} failed: ${data.error||response.status}`);return data;
}
export async function slackMessage(channel:string,text:string,thread?:string,blocks?:unknown[]){return slack('chat.postMessage',{channel,text,unfurl_links:false,unfurl_media:false,...(thread?{thread_ts:thread}:{}),...(blocks?{blocks}:{})})}
export async function slackDM(user:string,text:string){const dm=await slack('conversations.open',{users:user});return slackMessage(dm.channel.id,text)}
export const slackButton=(text:string,action:string,value:string)=>({type:'button',text:{type:'plain_text',text},action_id:action,value});
export const slackBlocks=(text:string,buttons:unknown[])=>[{type:'section',text:{type:'mrkdwn',text}},{type:'actions',elements:buttons}];
