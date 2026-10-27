import {claimAttendanceLink} from '@/lib/slack-attendance-store';
import {sql,hash,session} from '@/lib/auth';
import {beginGoogleFlow} from '@/lib/google-flow';
import {joinWithSavedCalendar} from '@/lib/calendar-connection';
import {attendanceMeeting,completeSlackAttendance} from '@/lib/slack-attendance';

export async function GET(req:Request){
 const secret=new URL(req.url).searchParams.get('token');
 if(!secret)return new Response('Invalid attendance link.',{status:400});
 const s=(await session(true))!;
 // A private, short-lived link binds only to the first browser session that opens it.
 const link=await claimAttendanceLink(sql(),hash(secret),s.id);
 if(!link)return new Response('This attendance link expired or was used. Click to attend again in Slack.',{status:410});
 const [r]=await sql()`SELECT * FROM slack_meetings WHERE id=${link.slack_meeting_id}`;
 try{
  const {row,inviteeId}=await attendanceMeeting(r,link.user_id);
  if(s.google_sub&&await joinWithSavedCalendar({id:row.id,constraints:row.constraints},s.google_sub,s.name||'Guest',s.id,inviteeId)){
   await completeSlackAttendance(link.id,s.id,s.google_sub);
   return Response.redirect(`https://app.slack.com/client/${encodeURIComponent(r.team_id)}/${encodeURIComponent(r.channel_id)}`,303);
  }
  return Response.redirect(await beginGoogleFlow(s.id,row.id,null,s.google_sub||null,inviteeId,'join',link.id),303);
 }catch{return new Response('Could not join this meeting. Return to Slack and click to attend again.',{status:409})}
}
