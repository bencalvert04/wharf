import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifySmtpFailure,classifyResendFailure,boundedFailure,retryDelay,IDEMPOTENCY_WINDOW_MS,deliveryMessage} from '../lib/delivery-policy.ts';

test('known SMTP temporary rejections and pre-submission failures retry safely',()=>{
 for(const error of [{responseCode:421,command:'DATA'},{responseCode:450},{code:'EDNS'},{code:'ETIMEDOUT',command:'CONN'}])assert.equal(classifySmtpFailure(error).state,'retry');
});
test('SMTP authentication and permanent rejections are actionable failures',()=>{
 assert.equal(classifySmtpFailure({code:'EAUTH',responseCode:535}).state,'failed');
 assert.equal(classifySmtpFailure({responseCode:550,command:'RCPT TO'}).state,'failed');
});
test('SMTP disconnect during DATA never retries blindly',()=>{
 for(const error of [{code:'ECONNECTION',command:'DATA'},{code:'ETIMEDOUT',command:'DATA'},{code:'ESOCKET'},Error('persistence failed')])assert.equal(classifySmtpFailure(error).state,'review');
});
test('Resend rate limits, server errors and timeouts use bounded retries',()=>{
 for(const status of [0,429,500,503])assert.equal(classifyResendFailure(status).state,'retry');
 assert.equal(classifyResendFailure(401).state,'failed');
 assert.equal(classifyResendFailure(422).state,'failed');
 const failure=classifyResendFailure(0),now=Date.now();
 assert.equal(boundedFailure(failure,1,now,'resend',now).state,'retry');
 assert.equal(boundedFailure(failure,8,now,'resend',now).state,'review');
 assert.equal(boundedFailure(failure,1,now-IDEMPOTENCY_WINDOW_MS,'resend',now).state,'review');
 assert.equal(retryDelay(1),60000);assert.equal(retryDelay(2),120000);assert.equal(retryDelay(20),3600000);
});
test('status copy distinguishes acceptance and delivery without claiming inbox success',()=>{
 assert.match(deliveryMessage({total:2,pending:0,needsReview:0,accepted:2}),/Recipient delivery is not yet confirmed/);
 assert.match(deliveryMessage({total:2,pending:0,needsReview:0,delivered:2}),/Inbox placement and calendar acceptance are not confirmed/);
 assert.match(deliveryMessage({total:2,pending:1,needsReview:0}),/retrying automatically/);
 assert.match(deliveryMessage({total:2,pending:0,needsReview:0,failed:1}),/could not be delivered/);
});
