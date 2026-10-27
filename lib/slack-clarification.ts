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
const timePresets={
 workday:{label:'Workday: 9am - 5pm',start:'09:00',end:'17:00'},
 lunchtime:{label:'Lunchtime: 11:30am - 2:30pm',start:'11:30',end:'14:30'},
 anytime:{label:'Any-Time: 5:00am - 10:00pm',start:'05:00',end:'22:00'},
 evening:{label:'Evening: 5pm - 10pm',start:'17:00',end:'22:00'}
};
export function timeRangeBlocks(thread:string,question:string){
 const needsDay=question==='What day and time range should I use?';
 return [
  {type:'section',text:{type:'mrkdwn',text:needsDay?'Choose a day and a time range.':'Choose a time range.'}},
  {type:'context',elements:[{type:'mrkdwn',text:`Times are in ${process.env.SLACK_DEFAULT_TIMEZONE||'America/Denver'}.`}]},
  {type:'actions',block_id:'wharf_time_range',elements:[
   ...(needsDay?[{type:'datepicker',action_id:'wharf_range_day',placeholder:{type:'plain_text',text:'Choose day'}}]:[]),
   ...Object.entries(timePresets).map(([preset,{label}])=>slackButton(label,`wharf_preset_${preset}`,JSON.stringify({thread,needsDay}))),
   slackButton('Other','wharf_answer',thread)
  ]}
 ];
}
export function timePresetAnswer(payload:any){
 const action=payload.actions[0],meta=JSON.parse(action.value);
 const preset=timePresets[action.action_id.replace('wharf_preset_','') as keyof typeof timePresets];
 if(!preset)throw Error('Choose one of the time range buttons.');
 const day=payload.state?.values?.wharf_time_range?.wharf_range_day?.selected_date;
 if(meta.needsDay&&!/^\d{4}-\d{2}-\d{2}$/.test(day||''))throw Error('Choose a day, then press a time range button.');
 return {thread:meta.thread,answer:`${meta.needsDay?`On ${day}, `:''}between ${preset.start} and ${preset.end} (${process.env.SLACK_DEFAULT_TIMEZONE||'America/Denver'}).`};
}
// Keep existing dropdown messages functional after the preset rollout.
export function timeRangeAnswer(payload:any){
 const meta=JSON.parse(payload.actions[0].value);
 const values=payload.state?.values?.wharf_time_range;
 const start=values?.wharf_range_start?.selected_option?.value,end=values?.wharf_range_end?.selected_option?.value,day=values?.wharf_range_day?.selected_date;
 if(!/^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(start||'')||!/^(?:(?:[01]\d|2[0-3]):(?:00|15|30|45)|24:00)$/.test(end||''))throw Error('Choose both a start and end time, then press Continue.');
 if(start>=end)throw Error('Choose an end time later than the start time.');
 if(meta.needsDay&&!/^\d{4}-\d{2}-\d{2}$/.test(day||''))throw Error('Choose a day, then press Continue.');
 return {thread:meta.thread,answer:`${meta.needsDay?`On ${day}, `:''}between ${start} and ${end} (${process.env.SLACK_DEFAULT_TIMEZONE||'America/Denver'}).${end==='24:00'?' The end is midnight at the end of that day.':''}`};
}
export async function askPrivately(channel:string,user:string,thread:string,question:string,duration=false){
 if(!duration&&['Between what start and end times should I look?','What day and time range should I use?'].includes(question)){await slack('chat.postEphemeral',{channel,user,text:question,blocks:timeRangeBlocks(thread,question)});return}
 const buttons=duration?[15,30,45,60].map(minutes=>slackButton(`${minutes} min`,`wharf_duration_${minutes}`,JSON.stringify({thread,minutes}))):[];
 buttons.push(slackButton(duration?'Other duration':'Answer privately','wharf_answer',thread));
 await slack('chat.postEphemeral',{channel,user,text:question,blocks:slackBlocks(question,buttons)});
}
export async function openPrivateAnswer(payload:any){
 const thread=payload.actions?.[0]?.value;
 await slack('views.open',{trigger_id:payload.trigger_id,view:{type:'modal',callback_id:'wharf_details',private_metadata:JSON.stringify({team:payload.team.id,channel:payload.channel.id,user:payload.user.id,thread}),title:{type:'plain_text',text:'Meeting details'},submit:{type:'plain_text',text:'Continue'},close:{type:'plain_text',text:'Cancel'},blocks:[{type:'input',block_id:'details',label:{type:'plain_text',text:'Your answer'},element:{type:'plain_text_input',action_id:'answer',multiline:true,placeholder:{type:'plain_text',text:'For example: 30 minutes, Thursday, 10 AM to 8 PM'}}}]}});
}
