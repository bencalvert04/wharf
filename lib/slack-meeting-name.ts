import {slack} from './slack-client.ts';

export function attendeeMeetingName(users:any[]){
 const humans=users.filter(u=>u&&!u.deleted&&!u.is_bot);
 const names=humans.map(u=>(u.profile?.real_name||u.real_name||u.profile?.display_name||u.name||'Guest').trim());
 const join=(parts:string[])=>parts.join(' & ');
 const full=join(names);if(full.length<=100)return full||'Group meeting';
 const first=join(names.map(n=>n.split(/\s+/)[0]));if(first.length<=100)return first;
 return join(names.map(n=>n.split(/\s+/).map((word:string)=>word[0]).join(''))).slice(0,100);
}

export async function slackMeetingName(channel:string,group:boolean){
 if(group){
  const members=await slack('conversations.members',{channel,limit:100});
  const ids=members.members.filter((id:string)=>id!==process.env.SLACK_BOT_USER_ID);
  const users=await Promise.all(ids.map(async(id:string)=>(await slack('users.info',{user:id})).user));
  return attendeeMeetingName(users);
 }
 const result=await slack('conversations.info',{channel});
 return String(result.channel.name).slice(0,100);
}
