import {sql} from './auth';
import {slack} from './slack-client';
import {bookingNoticeText} from './slack-booking-notice-text';
export async function announceSlackBooking(meetingId:string){
 const [job]=await sql()`SELECT payload,delivered_at FROM google_meeting_events WHERE meeting_id=${meetingId}`;
 const text=job&&bookingNoticeText({payload:job.payload,delivered_at:job.delivered_at});if(!text)return;
 const rows=await sql()`INSERT INTO slack_booking_notices(slack_meeting_id,text)
 SELECT id,${text} FROM slack_meetings WHERE meeting_id=${meetingId}
 ON CONFLICT(slack_meeting_id) DO UPDATE SET text=EXCLUDED.text RETURNING slack_meeting_id`;
 for(const row of rows)await sendNotice(row.slack_meeting_id);
}
async function sendNotice(id:string){
 const [notice]=await sql()`UPDATE slack_booking_notices n SET lease_until=now()+interval '90 seconds'
 FROM slack_meetings s WHERE n.slack_meeting_id=${id} AND s.id=n.slack_meeting_id AND n.sent_at IS NULL
 AND (n.lease_until IS NULL OR n.lease_until<now()) RETURNING n.text,s.channel_id`;
 if(!notice)return;
 try{
  await slack('chat.postMessage',{channel:notice.channel_id,text:notice.text,client_msg_id:id,unfurl_links:false,unfurl_media:false});
  await sql()`UPDATE slack_booking_notices SET sent_at=now(),lease_until=NULL WHERE slack_meeting_id=${id}`;
 }catch(error){await sql()`UPDATE slack_booking_notices SET lease_until=NULL WHERE slack_meeting_id=${id}`;throw error}
}
export async function retrySlackBookingNotices(){
 const rows=await sql()`SELECT slack_meeting_id FROM slack_booking_notices WHERE sent_at IS NULL AND (lease_until IS NULL OR lease_until<now()) LIMIT 20`;
 for(const row of rows)await sendNotice(row.slack_meeting_id).catch(()=>console.warn('Slack booking announcement retry failed'));
}
