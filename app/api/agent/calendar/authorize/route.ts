import {after} from 'next/server';
import {resumeSlackBooking} from '@/lib/slack-workflow';
import {session,sameOrigin,json} from '@/lib/auth';
import {publicAgentAuthorization,authorizeAgentCalendar,hasAgentCalendarPermission} from '@/lib/agent-calendar-authorization';
import {eventConnection,CalendarPermissionRequired} from '@/lib/google-meeting-events';
import {beginGoogleFlow} from '@/lib/google-flow';
export const maxDuration=120;

export async function GET(req:Request){
 const p=new URL(req.url).searchParams;
 try{const row=await publicAgentAuthorization(p.get('meeting')||'',p.get('token')||'');
 if(!row)return json({error:'This authorization link is invalid or expired.'},404);
 const s=await session();return json({title:JSON.parse(row.constraints).title,organizer:row.name,signedIn:!!s?.google_sub,correctAccount:!!s?.google_sub&&s.google_sub===row.google_sub,authorized:!!row.authorized_at&&row.authorized_sub===row.google_sub&&await hasAgentCalendarPermission(row.authorized_sub)});
 }catch{return json({error:'Could not load this authorization. Try again.'},503)}
}
export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 try{const {meetingId,token}=await req.json();if(typeof meetingId!=='string'||typeof token!=='string')return json({error:'Invalid authorization.'},400);
 const row=await publicAgentAuthorization(meetingId,token);if(!row)return json({error:'This authorization link is invalid or expired.'},404);
 const s=await session();if(!s?.google_sub||s.google_sub!==row.google_sub)return json({error:'Sign in with the Google account you used for your personal meeting invitation.'},403);
 try{await eventConnection(s.google_sub)}catch(error){if(!(error instanceof CalendarPermissionRequired))throw error;return json({url:await beginGoogleFlow(s.id,null,meetingId,s.google_sub,row.participant_id,'agent_events')})}
 await authorizeAgentCalendar(meetingId,row.participant_id,s.google_sub);
 after(()=>resumeSlackBooking(meetingId));
 return json({authorized:true});
 }catch{return json({error:'Could not authorize calendar invitations. Please try again.'},503)}
}
