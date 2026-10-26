type Message={ts:string;text?:string;user?:string;bot_id?:string;subtype?:string};
export function formatSlackHistory(messages:Message[],before:string){
 return messages.filter(m=>Number(m.ts)<Number(before)&&Number(m.ts)>=Number(before)-7*86400&&m.text&&!m.bot_id&&!m.subtype)
  .sort((a,b)=>Number(a.ts)-Number(b.ts)).slice(-15)
  .map(m=>JSON.stringify({at:new Date(Number(m.ts)*1000).toISOString(),author:m.user,text:m.text!.slice(0,1500)})).join('\n').slice(-6000);
}
// Bounded parallel reads, no retries or pagination on the meeting creation path.
export async function slackHistory(channel:string,before:string,thread?:string){
 try{
  const signal=AbortSignal.timeout(1500);
  const read=async(method:string,extra:Record<string,string>={})=>{
   const body=new URLSearchParams({channel,latest:before,inclusive:'false',oldest:String(Number(before)-7*86400),limit:'15',...extra});
   const response=await fetch(`https://slack.com/api/${method}`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SLACK_BOT_TOKEN}`,'Content-Type':'application/x-www-form-urlencoded'},body,signal});
   if(!response.ok)return [];
   const data=await response.json();return data.ok?data.messages||[]:[];
  };
  // Some Slack bot tokens cannot read public-channel replies. Channel history
  // still supplies context, and our saved clarification thread remains available.
  const results=await Promise.allSettled([read('conversations.history'),...(thread?[read('conversations.replies',{ts:thread})]:[])]);
  const messages=results.flatMap(result=>result.status==='fulfilled'?result.value:[]);
  return formatSlackHistory([...new Map(messages.map((m:Message)=>[m.ts,m])).values()] as Message[],before);
 }catch{return ''}
}
