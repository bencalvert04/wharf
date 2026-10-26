import {createHmac,timingSafeEqual} from 'node:crypto';
export function verifySlackSignature(body:string,timestamp:string|null,signature:string|null,secret:string,now=Date.now()){
 if(!secret||!timestamp||!/^\d+$/.test(timestamp)||!signature||!/^v0=[a-f0-9]{64}$/.test(signature)||Math.abs(now/1000-Number(timestamp))>300)return false;
 const expected='v0='+createHmac('sha256',secret).update(`v0:${timestamp}:${body}`).digest('hex');
 return timingSafeEqual(Buffer.from(expected),Buffer.from(signature));
}
export function slackMentions(text:string){return [...new Set([...text.matchAll(/<@([UW][A-Z0-9]+)>/g)].map(m=>m[1]))]}
export function slackEscape(text:string){return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
export function canControlMeeting(row:{team_id:string;channel_id:string;organizer_id:string},team:string,channel:string,user:string){return row.team_id===team&&row.channel_id===channel&&row.organizer_id===user}
