import {sql,keyMatches} from './auth';
import {plannerAllowed} from './planner-policy';
export async function plannerAccess(row:any,s:any,key?:string){
 const [slack]=await sql()`SELECT m.*,COALESCE(p.google_sub,a.google_sub) AS google_sub
 FROM slack_meetings m LEFT JOIN request_invitees p ON p.meeting_id=m.meeting_id AND p.id=m.organizer_id
 LEFT JOIN slack_google_accounts a ON a.team_id=m.team_id AND a.user_id=m.organizer_id
 WHERE m.meeting_id=${row.id}`;
 return {slack:slack||null,allowed:plannerAllowed(s,row.owner_session,slack?{google_sub:slack.google_sub}:null,!!key&&keyMatches(key,row.planner_key))};
}
