import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bookingNoticeText} from '../lib/slack-booking-notice-text.ts';
const payload={start:{dateTime:'2026-10-28T05:45:00Z',timeZone:'America/Denver'},end:{dateTime:'2026-10-28T06:15:00Z'}};
test('public booking confirmation waits for Google delivery and shows both local dates overnight',()=>{
 assert.equal(bookingNoticeText({payload}),null);
 const text=bookingNoticeText({payload,delivered_at:'2026-10-27T04:00:00Z'})!;
 assert.match(text,/Oct 27/);assert.match(text,/Oct 28/);
 assert.match(text,/11:45/);assert.match(text,/12:15/);assert.match(text,/MDT/);
 assert.match(text,/Calendar invites have been sent/);
});
