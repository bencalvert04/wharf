import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sendViaResend,InvitationSendError} from '../lib/invitation-provider.ts';
import {invitationEmail} from '../lib/calendar-invitation.ts';
const payload=invitationEmail({id:'meeting-1',title:'Planning',start:Date.parse('2026-11-02T16:00Z'),end:Date.parse('2026-11-02T16:30Z'),createdAt:Date.parse('2026-10-25T12:00Z'),organizer:'meetings@wharfmeetings.com',recipient:{name:'Test',email:'test@example.com'},url:'https://wharfmeetings.com/?meeting=meeting-1'});
test('provider replay uses the identical request body and key after an uncertain timeout',async()=>{
 const calls:RequestInit[]=[];
 const fake=(async(_input:unknown,init:RequestInit)=>{calls.push(init);if(calls.length===1)throw Error('timeout');return Response.json({id:'provider-123'})}) as typeof fetch;
 await assert.rejects(sendViaResend(payload,'job-123','test-key',fake),(e:unknown)=>e instanceof InvitationSendError&&e.failure.state==='retry');
 assert.equal(await sendViaResend(payload,'job-123','test-key',fake),'provider-123');
 assert.equal(calls[0].body,calls[1].body);
 assert.equal((calls[0].headers as Record<string,string>)['Idempotency-Key'],'wharf-invitation/job-123');
 const sent=JSON.parse(calls[1].body as string);assert.equal(sent.tags[0].value,'job-123');
 assert.equal(sent.attachments[0].content_type,'text/calendar; charset=utf-8; method=REQUEST');
});
test('provider permanent failures never become automatic retries',async()=>{
 const fake=(async()=>Response.json({name:'validation_error'},{status:422})) as typeof fetch;
 await assert.rejects(sendViaResend(payload,'job-123','test-key',fake),(e:unknown)=>e instanceof InvitationSendError&&e.failure.state==='failed');
});
