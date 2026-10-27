export type AttendanceDatabase=(strings:TemplateStringsArray,...values:any[])=>Promise<any[]>;
export async function completeAttendanceLink(db:AttendanceDatabase,id:string,sessionId:string,sub:string){
 const [link]=await db`WITH completed AS (
 UPDATE slack_attendance_links SET completed_at=now() WHERE id=${id} AND session_id=${sessionId}
 AND expires_at>now() AND completed_at IS NULL RETURNING *
 ) INSERT INTO slack_google_accounts(team_id,user_id,session_id,google_sub)
 SELECT team_id,user_id,${sessionId},${sub} FROM completed
 ON CONFLICT(team_id,user_id) DO UPDATE SET session_id=EXCLUDED.session_id,google_sub=EXCLUDED.google_sub RETURNING team_id,user_id`;
 if(!link)throw Error('Attendance link expired. Click to attend again in Slack.');
}
export async function claimAttendanceLink(db:AttendanceDatabase,id:string,sessionId:string){
 const [link]=await db`UPDATE slack_attendance_links SET session_id=${sessionId} WHERE id=${id}
 AND expires_at>now() AND completed_at IS NULL AND (session_id IS NULL OR session_id=${sessionId}) RETURNING *`;
 return link||null;
}
