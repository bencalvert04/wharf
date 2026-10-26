import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attendeeMeetingName,slackMeetingName} from '../lib/slack-meeting-name.ts';
test('DM names include every human and exclude apps and deleted users',()=>{
 assert.equal(attendeeMeetingName([{real_name:'Ben Calvert'},{real_name:'Ray Shaw'},{real_name:'Wharf',is_bot:true},{real_name:'Deleted',deleted:true}]),'Ben Calvert & Ray Shaw');
 const users=Array.from({length:9},(_,i)=>({real_name:`Person${i} Verylonglastname`}));
 const title=attendeeMeetingName(users);assert.ok(title.length<=100);for(let i=0;i<9;i++)assert.ok(title.includes(`Person${i}`));
});
test('channel title comes from current Slack metadata',async()=>{
 const original=fetch;globalThis.fetch=async()=>Response.json({ok:true,channel:{name:'renamed-channel'}});
 try{assert.equal(await slackMeetingName('C1',false),'renamed-channel')}finally{globalThis.fetch=original}
});
