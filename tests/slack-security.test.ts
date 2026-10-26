import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifySlackSignature,slackMentions,canControlMeeting,slackEscape} from '../lib/slack-security.ts';
test('Slack signatures authenticate raw bytes and reject replay, malformed headers, and missing configuration',()=>{
 const body='{"event":"hello"}',ts='1800000000',secret='secret',sig='v0='+createHmac('sha256',secret).update(`v0:${ts}:${body}`).digest('hex');
 assert.ok(verifySlackSignature(body,ts,sig,secret,1800000000000));
 for(const [b,t,s,k,now] of [[body+' ',ts,sig,secret,1800000000000],[body,ts,sig,secret,1800000301000],[body,ts,sig,secret,1799999699000],[body,ts,'v0=abc',secret,1800000000000],[body,'bad',sig,secret,1800000000000],[body,ts,sig,'',1800000000000]] as const)assert.equal(verifySlackSignature(b,t,s,k,now),false);
});
test('Only the organizer in the original workspace and channel controls a meeting',()=>{
 const r={team_id:'T1',channel_id:'C1',organizer_id:'U1'};
 assert.ok(canControlMeeting(r,'T1','C1','U1'));
 assert.equal(canControlMeeting(r,'T2','C1','U1'),false);assert.equal(canControlMeeting(r,'T1','C2','U1'),false);assert.equal(canControlMeeting(r,'T1','C1','U2'),false);
});
test('Roster comes from real Slack user mentions, and arbitrary text cannot create mentions in replies',()=>{
 assert.deepEqual(slackMentions('<@U123> @Ray <@U123> <@W456> <!channel>'),['U123','W456']);
 assert.equal(slackEscape('<!channel> & <https://evil.test|click>'),'&lt;!channel&gt; &amp; &lt;https://evil.test|click&gt;');
});
