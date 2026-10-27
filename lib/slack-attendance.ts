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
 return completeAttendanceLink(sql(),id,sessionId,sub);
}
export async function attendFromSlack(r:any,payload:any){
 const user=payload.user.id;
 const {row,inviteeId}=await attendanceMeeting(r,user);
 const [account]=await sql()`SELECT s.* FROM slack_google_accounts a JOIN sessions s ON s.id=a.session_id AND s.google_sub=a.google_sub
 WHERE a.team_id=${r.team_id} AND a.user_id=${user} AND s.expires_at>now()`;
 if(account&&await joinWithSavedCalendar({id:row.id,constraints:row.constraints},account.google_sub,account.name||'Guest',account.id,inviteeId)){
  await slack('chat.postEphemeral',{channel:r.channel_id,user,text:'You’re attending. Your Google calendar availability has been added to this meeting.'});return;
 }
 const secret=token();
 await sql()`INSERT INTO slack_attendance_links(id,team_id,user_id,slack_meeting_id) VALUES(${hash(secret)},${r.team_id},${user},${r.id})`;
 const url=`${appUrl()}/api/slack/attend?token=${encodeURIComponent(secret)}`;
 await slack('chat.postEphemeral',{channel:r.channel_id,user,text:`Connect your Google account to attend: <${url}|Continue with Google>`,
 blocks:[{type:'section',text:{type:'mrkdwn',text:'Connect Google once to attend. Future attendance clicks will stay here in Slack.'}},
 {type:'actions',elements:[{type:'button',text:{type:'plain_text',text:'Continue with Google'},url,action_id:'wharf_google_connect'}]}]});
}
