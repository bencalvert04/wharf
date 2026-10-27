import {embedAccess} from '@/lib/slack-embed';
import {sql} from '@/lib/auth';
function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'null','Vary':'Origin'}})}
export async function OPTIONS(){return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'null','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'}})}
import {shared} from '@/lib/availability';
import {availabilityRevision} from '@/lib/finalization';
import {bookSlackWebChoice} from '@/lib/slack-web-booking';
import {CalendarPermissionRequired,googleMeetingEvent,calendarStatus} from '@/lib/google-meeting-events';
import {AgentError} from '@/lib/agent-api';
import {slackMessage} from '@/lib/slack-client';
export const maxDuration=60;
async function access(req:Request){return embedAccess(req.headers.get('authorization')?.replace(/^Bearer /,'')||'')}
export async function GET(req:Request){try{
 const {row}=await access(req),c=JSON.parse(row.constraints);
 const people=await sql()`SELECT google_sub,name,email,busy FROM attendees WHERE meeting_id=${row.id} ORDER BY google_sub`;
 const [pending]=await sql()`SELECT count(*)::int AS count FROM request_invitees p WHERE p.meeting_id=${row.id} AND NOT EXISTS(SELECT 1 FROM attendees a WHERE a.meeting_id=p.meeting_id AND a.google_sub=p.google_sub)`;
 return json({id:row.id,constraints:c,windows:people.length?shared(c,people as any):[],attendees:people.map(p=>p.name),waiting:pending.count,revision:availabilityRevision(people as any),finalTime:row.final_time,calendar:calendarStatus(await googleMeetingEvent(row.id))});
 }catch{return json({error:'Reopen the calendar from the meeting card in Slack. Only the requester with a connected calendar can book.'},403)}}
export async function POST(req:Request){
 let auth;try{auth=await access(req)}catch{return json({error:'Reopen the calendar from Slack to continue.'},403)}
 try{
 const {start,end,revision}=await req.json();
 if(!Number.isFinite(start)||!Number.isFinite(end))return json({error:'Select a valid meeting time.'},400);
 const {row,r,sub}=auth;
 const people=await sql()`SELECT google_sub,name,email,busy FROM attendees WHERE meeting_id=${row.id} ORDER BY google_sub`;
 if(!row.final_time&&revision!==availabilityRevision(people as any))return json({error:'Availability changed. Refresh and select a time again.'},409);
 const result=await bookSlackWebChoice(r,sub,start,end);
 if(!row.final_time&&result.calendar?.status==='created')await slackMessage(r.channel_id,`Meeting booked for ${new Intl.DateTimeFormat('en-US',{timeZone:JSON.parse(row.constraints).zone,dateStyle:'full',timeStyle:'short'}).format(start)} (${JSON.parse(row.constraints).zone}). Google Calendar invitations have been sent.`,r.thread_ts).catch(()=>console.warn('Slack booking confirmation could not be delivered'));
 return json(result,result.calendar?.status==='created'?200:202);
 }catch(e){if(e instanceof CalendarPermissionRequired)return json({error:'Allow Google Calendar invitations on Wharf, then return here to book.',permission:true},409);if(e instanceof AgentError)return json({error:e.message},e.status);return json({error:'Booking could not be confirmed. Refresh before retrying.'},503)}
}
