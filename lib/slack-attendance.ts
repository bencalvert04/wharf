import {getAgentSlots} from './agent-api';
import {refreshAgentAvailability} from './agent-refresh';
import {openToken} from './token-vault';
import {earliestSlotPrompt} from './slack-slot-prompt';
import {calendarConnectPrompt} from './slack-connect-prompt';
import {completeAttendanceLink} from './slack-attendance-store';
export {canAttendSlackMeeting} from './slack-attendance-policy';
import {sql,token,hash,appUrl,meeting} from './auth';
import {joinWithSavedCalendar} from './calendar-connection';
import {slack} from './slack-client';

export async function attendanceMeeting(r:any,user:string){
 const row=await meeting(r.meeting_id);
 if(!row||row.final_time)throw Error('This meeting has expired or is already confirmed.');
 return {row,inviteeId:r.draft.openJoin?null:user};
}
export async function completeSlackAttendance(id:string,sessionId:string,sub:string){
 await completeAttendanceLink(sql(),id,sessionId,sub);
 const [r]=await sql()`SELECT s.* FROM slack_meetings s JOIN slack_attendance_links l ON l.slack_meeting_id=s.id WHERE l.id=${id}`;
 if(r)await notifyCalendarsReady(r).catch(()=>console.warn('Calendar readiness notification failed'));
}
export async function attendFromSlack(r:any,payload:any,automatic=false){
 const user=payload.user.id;
 const {row,inviteeId}=await attendanceMeeting(r,user);
 const [account]=await sql()`SELECT s.* FROM slack_google_accounts a JOIN sessions s ON s.id=a.session_id AND s.google_sub=a.google_sub
 WHERE a.team_id=${r.team_id} AND a.user_id=${user} AND s.expires_at>now()`;
 if(account&&await joinWithSavedCalendar({id:row.id,constraints:row.constraints},account.google_sub,account.name||'Guest',account.id,inviteeId)){
  if(!automatic){await slack('chat.postEphemeral',{channel:r.channel_id,user,text:'You’re attending. Your Google calendar availability has been added to this meeting.'});await notifyCalendarsReady(r)}return;
 }
 const secret=token();
 await sql()`INSERT INTO slack_attendance_links(id,team_id,user_id,slack_meeting_id) VALUES(${hash(secret)},${r.team_id},${user},${r.id})`;
 const url=`${appUrl()}/api/slack/attend?token=${encodeURIComponent(secret)}`;
 // Keep context and action in one payload: Slack renders private and public messages independently.
 await slack('chat.postEphemeral',{channel:r.channel_id,user,...calendarConnectPrompt(r.draft,url)});
}

export async function notifyCalendarsReady(r:any){
 if(r.draft.openJoin)return;
 const [claimed]=await sql()`UPDATE slack_meetings s SET ready_notified=true WHERE s.id=${r.id} AND NOT ready_notified
 AND EXISTS(SELECT 1 FROM request_invitees p WHERE p.meeting_id=s.meeting_id)
 AND NOT EXISTS(SELECT 1 FROM request_invitees p WHERE p.meeting_id=s.meeting_id AND NOT EXISTS(SELECT 1 FROM attendees a WHERE a.meeting_id=p.meeting_id AND a.google_sub=p.google_sub)) RETURNING s.id`;
 if(!claimed)return;
 try{await suggestEarliestSlackTime(r)}
 catch(error){await sql()`UPDATE slack_meetings SET ready_notified=false WHERE id=${r.id}`;throw error}
}

export async function suggestEarliestSlackTime(r:any){
 const key=openToken(r.key_cipher,`slack:${r.id}`);
 await refreshAgentAvailability(r.meeting_id,key);
 const slots=await getAgentSlots(r.meeting_id,key,{limit:1});
 await slack('chat.postEphemeral',{channel:r.channel_id,user:r.organizer_id,...earliestSlotPrompt(r.id,slots,`${appUrl()}/?meeting=${encodeURIComponent(r.meeting_id)}`)});
}
