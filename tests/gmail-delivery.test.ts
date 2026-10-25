import {test} from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import {invitationEmail} from '../lib/calendar-invitation.ts';
import {gmailConfigured,gmailMessage} from '../lib/gmail-delivery.ts';

test('Gmail message renders as an RSVP calendar request without contacting a server',async()=>{
 const original=process.env.INVITATION_FROM;
 process.env.INVITATION_FROM='wharfmeetings@gmail.com';
 try{
  const payload=invitationEmail({id:'meeting-1',title:'Planning',start:Date.parse('2026-11-02T16:00Z'),end:Date.parse('2026-11-02T16:30Z'),createdAt:Date.parse('2026-10-25T12:00Z'),organizer:'wharfmeetings@gmail.com',recipient:{name:'Test',email:'attendee@example.com'},url:'https://example.com/?meeting=meeting-1'});
  const message=gmailMessage(payload,'job-1');
  const output=await nodemailer.createTransport({streamTransport:true,buffer:true}).sendMail(message);
  const mime=output.message.toString();
  assert.match(mime,/From: Wharf <wharfmeetings@gmail.com>/);
  assert.match(mime,/text\/calendar;[^\r\n]*method=REQUEST/i);
  assert.match(mime,/Message-ID: <wharf-job-1@gmail.com>/i);
  assert.ok(!mime.includes('smtp.gmail.com'));
  assert.throws(()=>gmailMessage({...payload,from:'Other <other@example.com>'},'job-1'));
  assert.throws(()=>gmailMessage({...payload,to:['a@example.com','b@example.com']},'job-1'));
 }finally{if(original===undefined)delete process.env.INVITATION_FROM;else process.env.INVITATION_FROM=original}
});
test('a Gmail sender alone never enables delivery without a sending credential',()=>{
 const sender=process.env.INVITATION_FROM,password=process.env.GMAIL_APP_PASSWORD;
 try{process.env.INVITATION_FROM='wharfmeetings@gmail.com';delete process.env.GMAIL_APP_PASSWORD;assert.equal(gmailConfigured(),false)}
 finally{if(sender===undefined)delete process.env.INVITATION_FROM;else process.env.INVITATION_FROM=sender;if(password===undefined)delete process.env.GMAIL_APP_PASSWORD;else process.env.GMAIL_APP_PASSWORD=password}
});
