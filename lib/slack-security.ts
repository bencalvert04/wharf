import {createHmac,timingSafeEqual} from 'node:crypto';
export function verifySlackSignature(body:string,timestamp:string|null,signature:string|null,secret:string,now=Date.now()){
 if(!secret||!timestamp||!/^\d+$/.test(timestamp)||!signature||!/^v0=[a-f0-9]{64}$/.test(signature)||Math.abs(now/1000-Number(timestamp))>300)return false;
 const expected='v0='+createHmac('sha256',secret).update(`v0:${timestamp}:${body}`).digest('hex');
 return timingSafeEqual(Buffer.from(expected),Buffer.from(signature));
}
export function slackMentions(text:string){return [...new Set([...text.matchAll(/<@([UW][A-Z0-9]+)>/g)].map(m=>m[1]))]}
export function slackEscape(text:string){return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
export function canControlMeeting(row:{team_id:string;channel_id:string;organizer_id:string},team:string,channel:string,user:string){return row.team_id===team&&row.channel_id===channel&&row.organizer_id===user}

export function allowedSlackChannel(channel:unknown){return typeof channel==='string'&&[process.env.SLACK_CHANNEL_ID,...(process.env.SLACK_GROUP_CHANNEL_IDS||'').split(',')].filter(Boolean).includes(channel)}
export function slackIntent(text:string){
 const clean=text.replace(/<@[UW][A-Z0-9]+>/g,'').trim().toLowerCase().replace(/[?!.,]+$/,'');
 if(/^(are you there|hello|hi|hey|ping|help)$/.test(clean))return 'help';
 if(/\b(book|finali[sz]e|confirm|send (?:the )?invites|schedule)\b/.test(clean)){
  if(/\b(?:do not|don't|dont|not yet|never|cancel)\b/.test(clean))return 'hold';
  if(/\b(?:schedule|book|create|make|set up)\s+(?:us\s+)?(?:a|an)\s+(?:(?:\d+|half an?|an?)\s*(?:-?minutes?|hours?)\s+)?meeting\b/.test(clean))return 'schedule';
  if(/\b(?:new|another) (?:meeting|time|event)\b/.test(clean)||/\b(?:tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week)\b|\d{4}-\d{2}-\d{2}/.test(clean)&&! /\b(?:this|that|it|responded|joined|ready)\b/.test(clean))return 'schedule';
  return 'book';
 }
 if(/^(status|check( this meeting| availability)?|any update|who( is|'s) left|share( this meeting( in the channel)?| link)?)$/.test(clean))return 'status';
 return 'schedule';
}
