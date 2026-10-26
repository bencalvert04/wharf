import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarInvitation,invitationEmail,validEmail,type Invitation} from '../lib/calendar-invitation.ts';
const event:Invitation={id:'meeting-123',title:'Team planning',start:Date.parse('2026-11-02T16:00Z'),end:Date.parse('2026-11-02T16:30Z'),createdAt:Date.parse('2026-10-25T12:00Z'),organizer:'meetings@wharf.example',recipient:{name:'Attendee',email:'attendee@example.com'},url:'https://wharf.example/?meeting=meeting-123'};
test('creates an RSVP meeting request with exact UTC times and a stable meeting UID',()=>{
 const ics=calendarInvitation(event);
 for(const line of ['METHOD:REQUEST','UID:meeting-123@wharf.example','DTSTART:20261102T160000Z','DTEND:20261102T163000Z','ORGANIZER;CN=Wharf:mailto:meetings@wharf.example'])assert.ok(ics.includes(line));
 assert.ok(ics.replace(/\r\n /g,'').includes('ATTENDEE;RSVP=TRUE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:attendee@example.com'));
 assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});
test('meeting titles cannot inject ICS properties or email headers',()=>{
 const malicious={...event,title:'Planning\r\nATTENDEE:mailto:other@example.com;yes,no\\end'};
 const ics=calendarInvitation(malicious).replace(/\r\n /g,'');
 assert.equal(ics.split('\r\n').filter(line=>line.startsWith('ATTENDEE')).length,1);
 assert.ok(ics.includes('SUMMARY:Planning\\nATTENDEE:mailto:other@example.com\\;yes\\,no\\\\end'));
 assert.ok(!/[\r\n]/.test(invitationEmail(malicious).subject));
});
test('folds long Unicode content to at most 75 octets per physical line',()=>{
 const ics=calendarInvitation({...event,title:'会议🗓️'.repeat(100)});
 assert.ok(ics.split('\r\n').every(line=>Buffer.byteLength(line)<=75));
 assert.ok(ics.replace(/\r\n /g,'').includes('SUMMARY:'+'会议🗓️'.repeat(100)));
});
test('rejects malformed addresses, time ranges, and meeting identifiers',()=>{
 for(const address of ['a@example.com\r\nBcc: x@example.com','Name <a@example.com>','not-an-email',undefined])assert.equal(validEmail(address),false);
 assert.throws(()=>calendarInvitation({...event,organizer:'bad'}));
 assert.throws(()=>calendarInvitation({...event,recipient:{...event.recipient,email:'bad'}}));
 assert.throws(()=>calendarInvitation({...event,end:event.start}));
 assert.throws(()=>calendarInvitation({...event,id:'bad\r\nUID:injected'}));
});
test('sends one private invitation with the calendar request MIME type',()=>{
 const mail=invitationEmail(event);
 assert.deepEqual(mail.to,['attendee@example.com']);
 assert.equal(mail.attachments[0].content_type,'text/calendar; charset=utf-8; method=REQUEST');
 assert.equal(Buffer.from(mail.attachments[0].content,'base64').toString(),calendarInvitation(event));
 assert.equal(mail.from,'Wharf <meetings@wharf.example>');
});

test('professional invitation includes planner identity, local time, and a plain-text alternative',()=>{
 const mail=invitationEmail({...event,plannerName:'Ben Calvert',zone:'America/Denver'});
 assert.ok(mail.html.includes('Ben Calvert invited you'));
 assert.ok(mail.html.includes('9:00 AM – 9:30 AM'));
 assert.ok(mail.html.includes('America/Denver'));
 assert.ok(mail.html.includes('View meeting details'));
 assert.ok(mail.text.includes('Organized by: Ben Calvert'));
 assert.ok(mail.text.includes('9:00 AM – 9:30 AM (America/Denver)'));
 assert.ok(!mail.html.includes('href="mailto:'));
});
test('invitation HTML escapes meeting titles, planner names, and links',()=>{
 const mail=invitationEmail({...event,title:'<script>alert(1)</script>',plannerName:'<img src=x onerror=alert(1)>',url:'https://example.com/?meeting=x&mode=y'});
 assert.ok(!mail.html.includes('<script>'));
 assert.ok(!mail.html.includes('<img'));
 assert.ok(mail.html.includes('&lt;script&gt;'));
 assert.ok(mail.html.includes('meeting=x&amp;mode=y'));
 assert.throws(()=>invitationEmail({...event,url:'javascript:alert(1)'}));
});
