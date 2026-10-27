import {slack} from './slack-client.ts';
export async function channelRoster(channel:string,call:typeof slack=slack){
 const ids=new Set<string>();let cursor='';
 do{
  const page=await call('conversations.members',{channel,limit:200,...(cursor?{cursor}:{})});
  for(const id of page.members||[])ids.add(id);
  cursor=page.response_metadata?.next_cursor||'';
 }while(cursor);
 const people:{id:string;name:string}[]=[];
 // Keep Slack API concurrency bounded and exclude all apps, not only Wharf.
 const members=[...ids];
 for(let i=0;i<members.length;i+=5){
  const users=await Promise.all(members.slice(i,i+5).map(async id=>(await call('users.info',{user:id})).user));
  for(const user of users)if(user&&!user.deleted&&!user.is_bot&&!user.is_app_user&&user.id!=='USLACKBOT')people.push({id:user.id,name:String(user.profile?.real_name||user.real_name||user.profile?.display_name||user.name||'Guest').slice(0,100)});
 }
 if(!people.length)throw Error('No human channel members found.');
 return people;
}
export async function enrollRoster(people:{id:string}[],join:(id:string)=>Promise<void>,failed:(id:string)=>Promise<void>){
 // Attendance writes share a meeting revision, so do not race them.
 for(const person of people){try{await join(person.id)}catch{await failed(person.id)}}
}
