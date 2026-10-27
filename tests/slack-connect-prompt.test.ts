import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarConnectPrompt} from '../lib/slack-connect-prompt.ts';
test('calendar connection prompt places the meeting summary before instructions and link in one message',()=>{
 const url='https://wharfmeetings.com/api/slack/attend?token=test';
 const prompt=calendarConnectPrompt({startDate:'2026-10-27',endDate:'2026-10-27',dayStart:'12:49',dayEnd:'21:00',timezone:'America/Denver',durationMinutes:15},url);
 assert.match(prompt.blocks[0].text!.text,/I’m on it\. Planning a 15-minute meeting/);
 assert.match(prompt.blocks[1].text!.text,/Please link your Google Calendar/);
 assert.equal(prompt.blocks[2].elements![0].url,url);
 assert.ok(prompt.text.indexOf('I’m on it')<prompt.text.indexOf('Please link'));
 assert.ok(prompt.text.indexOf('Please link')<prompt.text.indexOf(url));
});
