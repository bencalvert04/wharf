import {pendingMeetings} from '@/lib/pending-meeting-store';
import {session,sql,hash,sameOrigin} from '@/lib/auth';
import { getDb } from '@/db';
import { requests } from '@/db/schema';
import { validate, type Constraints } from '@/lib/availability';
import {json} from '@/lib/auth';
import {isPendingMeeting} from '@/lib/pending-meetings';

export async function GET(){
 try{
  // The browser session and verified Google identity are the only list credentials.
  // A prior participant remains known after leaving; invitation visits alone do not add membership.
  if(!process.env.DATABASE_URL)return json({error:'Meeting storage is not connected yet.'},503);
  const s=await session();
  if(!s)return json({meetings:[]});
  const rows=await pendingMeetings(sql(),s.id,s.google_sub||null);
  const meetings=rows.filter(row=>isPendingMeeting(JSON.parse(row.constraints),row.final_time,row.last_activity_at)).map(row=>({id:row.id,constraints:JSON.parse(row.constraints) as Constraints,isPlanner:row.is_planner,joined:row.joined,canRejoin:!row.joined&&row.known_participant,lastActivityAt:row.last_activity_at,attendeeCount:row.attendee_count,plannerName:row.planner_name||null,attendees:row.attendees}));
  return json({meetings});
 }catch{return json({error:'Unable to load pending meetings. Please try again.'},503)}
}
export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:'Invalid origin.'},{status:403});
 let c:Constraints;
 try{const raw=await req.text();if(raw.length>5000)return Response.json({error:'Request too large.'},{status:413});c=JSON.parse(raw);validate(c)}catch(e){return Response.json({error:e instanceof SyntaxError?'Invalid JSON.':e instanceof Error?e.message:'Invalid request.'},{status:400})}
 if(!process.env.DATABASE_URL)return Response.json({error:'Meeting storage is not connected yet. Please try the sample calendars.'},{status:503});
 try{
 const clean:Constraints={...(c.demo===true?{demo:true,sampleCount:Number.isInteger(c.sampleCount)?Math.max(1,Math.min(4,c.sampleCount!)):4}:{}),title:c.demo===true?'lucid demo':c.title.trim()||'Untitled meeting',start:c.start,end:c.end,duration:c.duration,zone:c.zone,from:c.from,to:c.to,days:[...new Set(c.days)]};
 const id=crypto.randomUUID(), key=crypto.randomUUID();
 const owner=await session(true);
 const [identity]=owner?.google_sub?await sql()`SELECT name FROM attendees WHERE google_sub=${owner.google_sub} ORDER BY captured_at DESC LIMIT 1`:[];
 await sql()`INSERT INTO requests(id,constraints,created_at,planner_key,owner_session,planner_name) VALUES(${id},${JSON.stringify(clean)},${new Date().toISOString()},${'sha256:'+hash(key)},${owner!.id},${owner?.name||identity?.name||null})`;
 return Response.json({id,plannerKey:key,invitationUrl:`${new URL(req.url).origin}/?meeting=${id}`},{status:201,headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Unable to save this meeting. Please try again.'},{status:503})}
}
