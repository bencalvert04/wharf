export function canAttendSlackMeeting(r:any,team:string,channel:string,user:string){
 return r.team_id===team&&r.channel_id===channel&&!!user&&
  (r.draft.openJoin===true||r.draft.participants?.some((p:any)=>p.id===user));
}
