import {sql,appUrl} from './auth';
import {slack} from './slack-client';
import {embedToken,readEmbedToken} from './slack-embed-token';
import {plannerAccess} from './planner-access';
import {meeting} from './auth';
export function calendarEntity(r:any,previewUrl?:string){
 return {url:`${appUrl()}/?meeting=${r.meeting_id}`,external_ref:{id:r.meeting_id,type:'wharf_meeting'},entity_type:'slack#/entities/calendar_event',entity_payload:{attributes:{title:{text:r.draft.title},display_type:'Meeting calendar',product_name:'Wharf',full_size_preview:{is_supported:true,mime_type:'application/vnd.slack-embed',...(previewUrl?{preview_url:previewUrl}:{})}},fields:{}}};
}
export async function presentSlackCalendar(envelope:any){
 const e=envelope.event;
 const [r]=await sql()`SELECT * FROM slack_meetings WHERE meeting_id=${e.external_ref?.id||''} AND team_id=${envelope.team_id} AND channel_id=${e.channel} AND created_at>now()-interval '30 days'`;
 if(!r||e.external_ref?.type!=='wharf_meeting'||r.organizer_id!==e.user){await slack('entity.presentDetails',{trigger_id:e.trigger_id,error:{status:'restricted',custom_title:'Requester only',custom_message:'Only the person who requested this meeting can select its time.'}});return;}
 const access=embedToken({meeting:r.meeting_id,team:r.team_id,user:e.user});
 await slack('entity.presentDetails',{trigger_id:e.trigger_id,metadata:calendarEntity(r,`${appUrl()}/slack/calendar#access=${encodeURIComponent(access)}`)});
}
export async function embedAccess(token:string){
 const identity=readEmbedToken(token),row=await meeting(identity.meeting);
 if(!row)throw Error('Meeting not found or expired.');
 const [account]=await sql()`SELECT a.google_sub FROM slack_google_accounts a WHERE a.team_id=${identity.team} AND a.user_id=${identity.user}`;
 const access=await plannerAccess(row,account?{id:'',google_sub:account.google_sub}:null);
 if(!access.allowed||access.slack?.team_id!==identity.team||access.slack?.organizer_id!==identity.user)throw Error('Only the requester with a connected Google calendar can book this meeting.');
 return {row,r:access.slack,sub:account.google_sub};
}
