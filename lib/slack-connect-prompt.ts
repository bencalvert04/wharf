import {slackEscape} from './slack-security.ts';
import {slackMeetingWhen} from './slack-meeting-when.ts';

export function calendarConnectPrompt(draft:any,url:string){
 const summary=`I’m on it. Planning a ${draft.durationMinutes}-minute meeting ${slackEscape(slackMeetingWhen(draft,true))}. I’ll check everyone’s calendars to find a time that works.`;
 const instruction='You’ve been included in this meeting. Please link your Google Calendar. Future meetings in this conversation will include your availability automatically.';
 return {
  text:`${summary}\n\n${instruction}\n<${url}|Link Google Calendar>`,
  blocks:[
   {type:'section',text:{type:'mrkdwn',text:summary}},
   {type:'section',text:{type:'mrkdwn',text:instruction}},
   {type:'actions',elements:[{type:'button',text:{type:'plain_text',text:'Link Google Calendar'},url,action_id:'wharf_google_connect'}]}
  ]
 };
}
