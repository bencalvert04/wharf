import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dismissSlackPrompt} from '../lib/slack-dismiss.ts';
test('dismisses via Slack response URL without sending bot credentials',async t=>{
 const calls:any[]=[];t.mock.method(globalThis,'fetch',async(url:any,options:any)=>{calls.push({url:String(url),options});return new Response('ok')});
 await dismissSlackPrompt('https://hooks.slack.com/services/T/B/secret');
 assert.equal(calls.length,1);assert.deepEqual(JSON.parse(calls[0].options.body),{delete_original:true});
 assert.equal(calls[0].options.headers.Authorization,undefined);assert.equal(calls[0].options.redirect,'error');
 for(const url of [undefined,'bad','http://hooks.slack.com/services/T/B/X','https://example.com/services/X','https://hooks.slack.com.evil.test/services/X','https://hooks.slack.com/other','https://user:pass@hooks.slack.com/services/X'])await dismissSlackPrompt(url);
 assert.equal(calls.length,1);
});
test('expired callback or network failure never retries an already completed action',async t=>{
 t.mock.method(console,'warn',()=>{});
 t.mock.method(globalThis,'fetch',async()=>new Response('expired',{status:410}));
 await assert.doesNotReject(()=>dismissSlackPrompt('https://hooks.slack.com/services/T/B/X'));
 t.mock.method(globalThis,'fetch',async()=>{throw Error('network')});
 await assert.doesNotReject(()=>dismissSlackPrompt('https://hooks.slack.com/services/T/B/X'));
});
