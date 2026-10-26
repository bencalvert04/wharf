export type Invitation = {
 id:string; title:string; start:number; end:number; createdAt:number;
 organizer:string; plannerName?:string|null; zone?:string; recipient:{name:string;email:string}; url:string;
};
export function validEmail(value:unknown):value is string {
 return typeof value==='string'&&value.length<=254&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(value);
}
const escapeText=(value:string)=>value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const utc=(value:number)=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
// Fold by UTF-8 octets rather than JavaScript characters (RFC 5545 section 3.1).
function fold(line:string){let result='',length=0;for(const char of line){const bytes=Buffer.byteLength(char);if(length+bytes>75){result+='\r\n ';length=1}result+=char;length+=bytes}return result}
export function calendarInvitation(event:Invitation){
 if(!validEmail(event.organizer)||!validEmail(event.recipient.email))throw Error('Invalid invitation address.');
 if(!Number.isFinite(event.start)||!Number.isFinite(event.end)||event.end<=event.start)throw Error('Invalid meeting time.');
 if(!/^[a-zA-Z0-9-]+$/.test(event.id))throw Error('Invalid meeting identifier.');
 return [
 'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Wharf//Meeting invitations//EN','CALSCALE:GREGORIAN','METHOD:REQUEST','BEGIN:VEVENT',
 `UID:${event.id}@${event.organizer.split('@')[1]}`,`DTSTAMP:${utc(event.createdAt)}`,'SEQUENCE:0',
 `DTSTART:${utc(event.start)}`,`DTEND:${utc(event.end)}`,`SUMMARY:${escapeText(event.title)}`,
 `DESCRIPTION:${escapeText((event.plannerName?event.plannerName+' invited you to this meeting. ':'')+'Scheduled with Wharf. Respond using your calendar’s invitation controls. '+event.url)}`,
 `ORGANIZER;CN=Wharf:mailto:${event.organizer}`,
 `ATTENDEE;RSVP=TRUE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:${event.recipient.email}`,
 'STATUS:CONFIRMED','TRANSP:OPAQUE','END:VEVENT','END:VCALENDAR',
 ].map(fold).join('\r\n')+'\r\n';
}
const htmlEscape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function invitationEmail(event:Invitation){
 const link=new URL(event.url);
 if(link.protocol!=='https:'&&link.protocol!=='http:')throw Error('Invalid meeting link.');
 const zone=event.zone||'UTC';
 const date=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:zone}).format(event.start);
 const clock=new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:zone});
 const time=clock.format(event.start)+' – '+clock.format(event.end);
 const duration=(event.end-event.start)/60000;
 const planner=event.plannerName?.trim();
 const intro=planner?planner+' invited you to a meeting.':'You’re invited to a meeting scheduled with Wharf.';
 const title=htmlEscape(event.title),safeLink=htmlEscape(link.href);
 const html=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meeting invitation</title></head>
<body style="margin:0;padding:0;background:#f3f5f1;color:#1f2c25;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${htmlEscape(intro)} ${htmlEscape(date)} · ${htmlEscape(time)} (${htmlEscape(zone)}).</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f1"><tr><td align="center" style="padding:36px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px">
<tr><td style="padding:0 0 22px;font-size:24px;font-weight:700;letter-spacing:-1px;color:#284b38">Wharf<span style="font-size:11px;font-weight:400;letter-spacing:1px;color:#68756c;padding-left:12px">MEETING INVITATION</span></td></tr>
<tr><td style="background:#fff;border:1px solid #dce4db;border-radius:12px;padding:32px">
<p style="margin:0 0 12px;color:#58705e;font-size:11px;font-weight:700;letter-spacing:1.5px">YOU’RE INVITED</p>
<h1 style="margin:0 0 14px;font-size:28px;line-height:1.25;font-weight:600;letter-spacing:-0.6px;overflow-wrap:anywhere">${title}</h1>
<p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#5a675f">${htmlEscape(intro)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f1;border:1px solid #e0e8db;border-radius:8px"><tr><td style="padding:22px">
<p style="margin:0 0 8px;font-size:16px;font-weight:600;line-height:1.5">${htmlEscape(date)}</p>
<p style="margin:0 0 8px;font-size:23px;line-height:1.4">${htmlEscape(time)}</p>
<p style="margin:0;font-size:12px;line-height:1.7;color:#64715f">${htmlEscape(zone.replaceAll('_',' '))} &nbsp; · &nbsp; ${duration} minutes</p>
${planner?`<p style="margin:16px 0 0;padding-top:16px;border-top:1px solid #dce4d7;font-size:13px;line-height:1.6;color:#455a49">Organized by <strong>${htmlEscape(planner)}</strong></p>`:''}
</td></tr></table>
<h2 style="margin:26px 0 8px;font-size:15px;font-weight:600">Respond in your calendar</h2>
<p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#5a675f">Use your calendar app’s <strong>Yes</strong>, <strong>Maybe</strong>, or <strong>No</strong> invitation controls. If this meeting isn’t in your calendar yet, use the calendar invitation included with this email.</p>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#284b38" style="border-radius:6px"><a href="${safeLink}" style="display:inline-block;padding:14px 22px;border:1px solid #284b38;border-radius:6px;color:#fff;text-decoration:none;font-size:14px;font-weight:600">View meeting details &rarr;</a></td></tr></table>
<p style="margin:18px 0 0;font-size:12px;line-height:1.7;color:#6c786f">You received this invitation because you joined this meeting on Wharf. Wharf does not need permission to edit your calendar.</p>
</td></tr><tr><td style="padding:20px 8px;font-size:11px;line-height:1.8;color:#778177">Scheduled with Wharf · ${htmlEscape(link.hostname)}<br>Your calendar settings determine when invitations appear.</td></tr>
</table></td></tr></table></body></html>`;
 return {from:`Wharf <${event.organizer}>`,to:[event.recipient.email],subject:`Invitation: ${event.title.replace(/[\r\n]/g,' ')}`,
 text:`${event.title}\n\n${intro}\n\n${date}\n${time} (${zone})\nDuration: ${duration} minutes.${planner?'\nOrganized by: '+planner:''}\n\nRespond using Yes, Maybe, or No in your calendar app. If the meeting is not there yet, use the calendar invitation included with this email.\n\nView meeting details: ${link.href}\n\nYou received this invitation because you joined this meeting on Wharf. Your calendar settings determine when it appears. Wharf does not need permission to edit your calendar.`,
 html,
 attachments:[{filename:'invitation.ics',content:Buffer.from(calendarInvitation(event)).toString('base64'),content_type:'text/calendar; charset=utf-8; method=REQUEST'}]};
}
