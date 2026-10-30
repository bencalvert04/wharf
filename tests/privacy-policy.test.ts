import {test} from 'node:test';
import assert from 'node:assert/strict';
import {privacyPolicy} from '../lib/privacy-policy.ts';
import {formatSlackHistory} from '../lib/slack-history.ts';

test('privacy describes server-side profile storage separately from the browser cookie',()=>{
 assert.match(privacyPolicy.profile,/server-side session record in Neon Postgres/);
 assert.match(privacyPolicy.profile,/opaque, HTTP-only session cookie, not those profile fields/);
 assert.doesNotMatch(privacyPolicy.profile,/profile photo URL in your browser session/);
});
test('provider privacy distinguishes calendar-reading login, retained credentials, and new email delivery',()=>{
 assert.match(privacyPolicy.profile,/Google sign-in alone/);
 assert.match(privacyPolicy.profile,/choosing Outlook or iCloud also connects that calendar/);
 assert.match(privacyPolicy.otherCalendars,/credentials do not expire with browser sessions or meetings/);
 assert.match(privacyPolicy.otherCalendars,/remain until disconnected or replaced/);
 assert.match(privacyPolicy.otherCalendars,/Unsupported floating event times/);
 assert.match(privacyPolicy.otherCalendars,/pseudonymous, one-way hash/);
 assert.match(privacyPolicy.otherCalendars,/eligible for deletion fifteen minutes after its latest use/);
 assert.match(privacyPolicy.connection,/anti-replay hash and ordering number remain/);
 assert.match(privacyPolicy.retention,/Gmail for Outlook\/iCloud-organized meetings/);
});
test('privacy distinguishes bounded background history, saved clarification context, and supported providers',()=>{
 assert.match(privacyPolicy.slack,/15 human messages from the preceding seven days, capped at 6,000 characters/);
 assert.match(privacyPolicy.slack,/author identifiers and timestamps/);
 assert.match(privacyPolicy.slack,/Anthropic \(Claude\) or Typesafe \(Jev\)/);
 assert.match(privacyPolicy.slack,/When Jev is selected, Anthropic may separately process limited message text/);
 assert.match(privacyPolicy.slack,/do not send Google Calendar snapshots, access tokens, or meeting credentials to either AI provider/);
 assert.match(privacyPolicy.slack,/up to 12 recent entries/);
 assert.match(privacyPolicy.slack,/one day after its last update/);
 assert.match(privacyPolicy.slack,/expired context is removed by the daily cleanup job/);
});
test('privacy covers suggestion and booking refreshes and separates disconnect from other retained data',()=>{
 assert.match(privacyPolicy.connection,/suggests a meeting time after calendars are connected/);
 assert.match(privacyPolicy.connection,/find and book a time/);
 assert.match(privacyPolicy.connection,/primary-calendar free\/busy information for that meeting’s date range/);
 assert.match(privacyPolicy.connection,/do not continuously sync/);
 assert.match(privacyPolicy.connection,/retained only to retry revocation/);
 assert.match(privacyPolicy.connection,/deleted when disconnection succeeds/);
 assert.match(privacyPolicy.connection,/does not delete your browser sessions, snapshots already shared with meetings, or meeting membership records/);
});
test('history actually honors the disclosed human-message count, age, and total size',()=>{
 const before=1900000000,week=7*86400;
 const messages=Array.from({length:25},(_,i)=>({ts:String(before-i-1),user:'U1',text:`human-${i}`}));
 const records=formatSlackHistory(messages,String(before)).split('\n').map(line=>JSON.parse(line));
 assert.equal(records.length,15);
 assert.deepEqual(records.map(m=>m.text),Array.from({length:15},(_,i)=>`human-${14-i}`));
 const boundary=formatSlackHistory([
  {ts:String(before-week),user:'U1',text:'oldest permitted'},
  {ts:String(before-week-1),user:'U1',text:'too old'},
  {ts:String(before-1),user:'U1',bot_id:'B1',text:'bot'},
  {ts:String(before-2),user:'U1',subtype:'message_changed',text:'system'},
  {ts:String(before),user:'U1',text:'current request'},
 ],String(before));
 assert.match(boundary,/oldest permitted/);
 assert.doesNotMatch(boundary,/too old|bot|system|current request/);
 assert.equal(formatSlackHistory(messages.map(m=>({...m,text:'x'.repeat(2000)})),String(before)).length,6000);
});
