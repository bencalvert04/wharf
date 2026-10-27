import {test} from 'node:test';
import assert from 'node:assert/strict';
import {embedToken,readEmbedToken} from '../lib/slack-embed-token.ts';
test('embed identity is authenticated, scoped and expires after ten minutes',()=>{
 process.env.GOOGLE_TOKEN_ENCRYPTION_KEY='ab'.repeat(32);
 const identity={meeting:'meeting',team:'team',user:'requester'},now=Date.now();
 const token=embedToken(identity,now);
 assert.deepEqual(readEmbedToken(token,now),{...identity,expires:now+600000});
 assert.throws(()=>readEmbedToken(token,now+600000));
 const parts=token.split('.');parts[3]=(parts[3][0]==='A'?'B':'A')+parts[3].slice(1);
 assert.throws(()=>readEmbedToken(parts.join('.'),now));
 assert.throws(()=>readEmbedToken('',now));
});
