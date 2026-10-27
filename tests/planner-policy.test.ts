import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plannerAllowed} from '../lib/planner-policy.ts';
test('Slack requester identity overrides the first browser owner and shared keys',()=>{
 const requester={google_sub:'requester-google'};
 assert.equal(plannerAllowed({id:'new-session',google_sub:'requester-google'},'old-session',requester),true);
 assert.equal(plannerAllowed({id:'old-session',google_sub:'guest-google'},'old-session',requester,true),false);
 assert.equal(plannerAllowed(null,'old-session',requester,true),false);
 assert.equal(plannerAllowed({id:'old-session'},'old-session',{google_sub:null},true),false);
 assert.equal(plannerAllowed({id:'guest',google_sub:'guest-google'},null,requester),false);
});
test('ordinary website meetings retain their existing browser/key ownership',()=>{
 assert.equal(plannerAllowed({id:'owner'},'owner',null),true);
 assert.equal(plannerAllowed({id:'guest'},'owner',null),false);
 assert.equal(plannerAllowed(null,'owner',null,true),true);
});
