import {createPublicKey,verify} from 'node:crypto';
export function verifyDiscordSignature(raw:string,timestamp:string|null,signature:string|null,publicKey:string,now=Date.now()){
 if(!timestamp||!/^\d+$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300||!signature||!/^[a-f\d]{128}$/i.test(signature)||!/^[a-f\d]{64}$/i.test(publicKey))return false;
 try{const key=createPublicKey({key:Buffer.from('302a300506032b6570032100'+publicKey,'hex'),format:'der',type:'spki'});return verify(null,Buffer.from(timestamp+raw),key,Buffer.from(signature,'hex'))}catch{return false}
}
export function discordText(text:string){return text.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g,'[$2]($1)').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/\bSlack\b/g,'Discord').replace(/@Wharf/g,'/wharf')}
export function validDiscordId(value:unknown):value is string{return typeof value==='string'&&/^\d{17,20}$/.test(value)}
export function canUseDiscordComponent(row:any,payload:any){
 const user=payload.member?.user?.id||payload.user?.id;
 return !!user&&(!row.user_id||row.user_id===user)&&
  (payload.guild_id?row.team_id===`discord:${payload.guild_id}`:row.user_id===user)&&
  (!payload.guild_id||row.channel_id===payload.channel_id);
}
