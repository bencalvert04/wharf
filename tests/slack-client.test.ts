import {test} from 'node:test';
import assert from 'node:assert/strict';
import {slack,slackMessage,slackButton,slackBlocks} from '../lib/slack-client.ts';

test('User lookups send form arguments while messages preserve JSON blocks',async(t)=>{
 const requests:{url:string,init:RequestInit}[]=[];
 t.mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
  requests.push({url,init});
  return Response.json({ok:true,user:{id:'U123'}});
 });
 await slack('users.info',{user:'U123'});
 assert.equal(new Headers(requests[0].init.headers).get('content-type'),'application/x-www-form-urlencoded');
 assert.equal(new URLSearchParams(String(requests[0].init.body)).get('user'),'U123');
 const blocks=slackBlocks('Meeting',[slackButton('Create meeting','wharf_create','draft-1')]);
 await slackMessage('C123','Meeting','123.456',blocks);
 assert.equal(new Headers(requests[1].init.headers).get('content-type'),'application/json');
 assert.deepEqual(JSON.parse(String(requests[1].init.body)),{channel:'C123',text:'Meeting',thread_ts:'123.456',blocks,unfurl_links:false,unfurl_media:false});
});
