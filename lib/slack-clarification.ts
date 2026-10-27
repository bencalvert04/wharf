import {slack,slackBlocks,slackButton} from './slack-client.ts';
export function hasMeetingDuration(text:string){
 return /\b(?:\d+(?:\.\d+)?|a|an|one|two|three|four|fifteen|thirty|forty[- ]five|sixty|ninety)\s*(?:-\s*)?(?:minutes?|mins?|hours?|hrs?)\b|\b(?:quarter|half)[ -](?:an? )?hour\b/i.test(text);
}
export function missingMeetingDetail(text:string){
 if(!hasMeetingDuration(text))return {question:'How long should the meeting be?',duration:true};
 const day=/\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week)\b|\d{4}-\d{2}-\d{2}|\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text);
 const window=/\b(between|before|after|until|by|from|morning|afternoon|evening|tonight|any ?time|sometime|all day|business hours)\b|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:to|and|[-–])\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i.test(text);
 if(!day&&!window)return {question:'What day and time range should I use?',duration:false};
 if(day&&!window)return {question:'Between what start and end times should I look?',duration:false};
 return null;
}
export async function askPrivately(channel:string,user:string,thread:string,question:string,duration=false){
 const buttons=duration?[15,30,45,60].map(minutes=>slackButton(`${minutes} min`,'wharf_duration',JSON.stringify({thread,minutes}))):[];
 buttons.push(slackButton(duration?'Other duration':'Answer privately','wharf_answer',thread));
 await slack('chat.postEphemeral',{channel,user,text:question,blocks:slackBlocks(question,buttons)});
}
export async function openPrivateAnswer(payload:any){
 const thread=payload.actions?.[0]?.value;
 await slack('views.open',{trigger_id:payload.trigger_id,view:{type:'modal',callback_id:'wharf_details',private_metadata:JSON.stringify({team:payload.team.id,channel:payload.channel.id,user:payload.user.id,thread}),title:{type:'plain_text',text:'Meeting details'},submit:{type:'plain_text',text:'Continue'},close:{type:'plain_text',text:'Cancel'},blocks:[{type:'input',block_id:'details',label:{type:'plain_text',text:'Your answer'},element:{type:'plain_text_input',action_id:'answer',multiline:true,placeholder:{type:'plain_text',text:'For example: 30 minutes, Thursday, 10 AM to 8 PM'}}}]}});
}
