export type Invitation = {
 id:string; title:string; start:number; end:number; createdAt:number;
 organizer:string; recipient:{name:string;email:string}; url:string;
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
 `DESCRIPTION:${escapeText('Meeting planned with Wharf. '+event.url)}`,
 `ORGANIZER;CN=Wharf:mailto:${event.organizer}`,
 `ATTENDEE;RSVP=TRUE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:${event.recipient.email}`,
 'STATUS:CONFIRMED','TRANSP:OPAQUE','END:VEVENT','END:VCALENDAR',
 ].map(fold).join('\r\n')+'\r\n';
}
export function invitationEmail(event:Invitation){
 const time=new Intl.DateTimeFormat('en-US',{dateStyle:'full',timeStyle:'long',timeZone:'UTC'}).format(event.start);
 return {from:`Wharf <${event.organizer}>`,to:[event.recipient.email],subject:`Invitation: ${event.title.replace(/[\r\n]/g,' ')}`,
 text:`You’re invited to ${event.title}.\n${time}\nDuration: ${(event.end-event.start)/60000} minutes.\n\nAccept or decline the calendar invitation in your email or calendar app.\n${event.url}`,
 attachments:[{filename:'invitation.ics',content:Buffer.from(calendarInvitation(event)).toString('base64'),content_type:'text/calendar; charset=utf-8; method=REQUEST'}]};
}
