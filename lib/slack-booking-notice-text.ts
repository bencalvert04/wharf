export function bookingNoticeText(job:{delivered_at?:unknown;payload:{start:{dateTime:string;timeZone:string};end:{dateTime:string}}}){
 if(!job.delivered_at)return null;
 const {start,end}=job.payload;
 const format=new Intl.DateTimeFormat('en-US',{timeZone:start.timeZone,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
 return `It’s booked! We’re meeting ${format.formatRange(new Date(start.dateTime),new Date(end.dateTime))}. Calendar invites have been sent to everyone attending.`;
}
