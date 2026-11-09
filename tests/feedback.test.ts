import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseFeedback,feedbackMessage,feedbackRecipients} from '../lib/feedback.ts';
const raw={id:'9ca37e4b-bf90-4c14-a10d-264e35c028ea',kind:'problem',message:'The calendar button did not work.',email:'user@example.com',page:'results'};
test('feedback validates inputs and strips private or arbitrary context',()=>{
 const parsed=parseFeedback({...raw,url:'https://site/?meeting=secret',calendar:{private:true},to:'attacker@example.com'})!;
 assert.deepEqual(parsed,raw);
 assert.equal(parseFeedback({...raw,email:'x@example.com\r\nBcc: attacker@example.com'}),null);
 assert.equal(parseFeedback({...raw,message:'short'}),null);
 assert.equal(parseFeedback({...raw,message:'x'.repeat(3001)}),null);
 assert.equal(parseFeedback({...raw,kind:'arbitrary'}),null);
 assert.equal(parseFeedback({...raw,email:''})?.email,'');
 assert.equal(parseFeedback({...raw,page:'/?meeting=secret'})?.page,'other');
});
test('feedback mail always goes to both founders with reply-to and no attachments',()=>{
 const message=feedbackMessage(raw as any,'wharfmeetings@gmail.com');
 assert.deepEqual(message.to,feedbackRecipients);assert.equal(message.replyTo,'user@example.com');
 assert.equal(message.from.address,'wharfmeetings@gmail.com');assert.equal('attachments' in message,false);
 assert.equal(message.disableFileAccess,true);assert.equal(message.disableUrlAccess,true);
});
test('feedback tables are idempotent, deduplicate reports, and cap submissions',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');
 const {feedbackSchema}=await import('../db/feedback-schema.mjs');
 const db=new PGlite();
 try{
  for(let i=0;i<2;i++)for(const statement of feedbackSchema)await db.exec(statement);
  const claim="INSERT INTO feedback_attempts(id) VALUES('report') ON CONFLICT DO NOTHING RETURNING id";
  assert.equal((await db.query(claim)).rows.length,1);
  assert.equal((await db.query(claim)).rows.length,0);
  const limit="INSERT INTO feedback_limits(key,attempts,expires_at) VALUES('bucket',1,now()+interval '2 hours') ON CONFLICT(key) DO UPDATE SET attempts=feedback_limits.attempts+1 WHERE feedback_limits.attempts<5 RETURNING key";
  for(let i=0;i<5;i++)assert.equal((await db.query(limit)).rows.length,1);
  assert.equal((await db.query(limit)).rows.length,0);
 }finally{await db.close()}
});
