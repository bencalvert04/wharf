import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveSlackFollowup,runSlackBooking} from '../lib/slack-booking-flow.ts';
import {slackIntent} from '../lib/slack-security.ts';
const row={id:'one',team_id:'team',channel_id:'channel',organizer_id:'ben',thread_ts:'request',invitation_ts:'card'};
const scope={team:'team',channel:'channel',user:'ben'};
test('booking followup is a booking intent, not another scheduling request',()=>{
 assert.equal(slackIntent('<@U123> we have all responded. book us a time that works for all of us'),'book');
 assert.equal(slackIntent('book a meeting tomorrow at 3'),'schedule');
 assert.equal(slackIntent('schedule us a new meeting'),'schedule');
 assert.equal(slackIntent('do not book'),'hold');
 assert.equal(slackIntent("don't schedule anything yet"),'hold');
 assert.equal(slackIntent('<@U123> find a time we can meet before 9 pm today'),'schedule');
});
test('followups resolve one scoped meeting and invitation threads, reject ambiguity and cross-scope matches',()=>{
 assert.equal(resolveSlackFollowup([row],scope).meeting?.id,'one');
 const other={...row,id:'two',thread_ts:'other',invitation_ts:'other-card'};
 assert.equal(resolveSlackFollowup([row,other],scope).ambiguous,true);
 assert.equal(resolveSlackFollowup([row,other],{...scope,thread:'card'}).meeting?.id,'one');
 assert.equal(resolveSlackFollowup([row],{...scope,thread:'unrelated'}).meeting,null);
 assert.equal(resolveSlackFollowup([row],{...scope,team:'other'}).meeting,null);
 assert.equal(resolveSlackFollowup([row],{...scope,channel:'other'}).meeting,null);
 assert.equal(resolveSlackFollowup([row],{...scope,user:'other'}).meeting,null);
 assert.equal(resolveSlackFollowup([{...row,finalized:true}],scope).meeting,null);
 // An exact finalized thread still supports idempotent status/retry.
 assert.equal(resolveSlackFollowup([{...row,finalized:true}],{...scope,thread:'request'}).meeting?.id,'one');
});
const ready=()=>({status:'ready',responseSummary:{waitingFor:[],responded:2},calendarEventCreated:false,finalTime:null});
function fixture(patch:any={}){
 const calls:string[]=[],choices:any[]=[],pending:boolean[]=[];let state:any=ready();
 const deps={read:async()=>{calls.push('read');return state},refresh:async()=>{calls.push('refresh')},organizer:async()=>{calls.push('organizer');return 'verified-google-participant'},authorize:async(id:string)=>{calls.push('authorize:'+id);return {authorized:true}},slots:async()=>{calls.push('slots');return {revision:8,slots:[{id:'earliest'},{id:'later'}]}},book:async(choice:any)=>{calls.push('book');choices.push(choice);return {...state,calendarEventCreated:true}},pending:async(v:boolean)=>{pending.push(v)},...patch};
 return {deps,calls,choices,pending,set:(v:any)=>state=v};
}
test('text claiming everyone responded cannot book an empty or incomplete roster',async()=>{
 for(const m of [{...ready(),status:'awaiting_responses',responseSummary:{waitingFor:[],responded:0}},{...ready(),responseSummary:{waitingFor:['ray'],responded:1}}]){
  const f=fixture();f.set(m);assert.equal((await runSlackBooking(f.deps)).kind,'waiting');assert.deepEqual(f.calls,['read']);assert.deepEqual(f.pending,[false]);
 }
});
test('book uses joined organizer identity, refreshes live calendars, then selects earliest exact fresh revision',async()=>{
 const f=fixture();assert.equal((await runSlackBooking(f.deps)).kind,'booked');
 assert.deepEqual(f.calls,['read','organizer','authorize:verified-google-participant','refresh','read','slots','book']);
 assert.deepEqual(f.choices,[{slotId:'earliest',revision:8}]);assert.deepEqual(f.pending,[true,false]);
});
test('missing Google requester identity cannot authorize a different participant',async()=>{
 const f=fixture({organizer:async()=>null});assert.equal((await runSlackBooking(f.deps)).kind,'organizer_missing');assert.deepEqual(f.calls,['read']);assert.deepEqual(f.choices,[]);
});
test('missing write consent pauses durable booking, and consent resumption refreshes before booking',async()=>{
 const f=fixture({authorize:async()=>({authorized:false,authorizationUrl:'private-consent'})});
 assert.equal((await runSlackBooking(f.deps)).kind,'consent');assert.deepEqual(f.pending,[true]);assert.ok(!f.calls.includes('refresh'));assert.deepEqual(f.choices,[]);
 f.deps.authorize=async()=>({authorized:true});assert.equal((await runSlackBooking(f.deps)).kind,'booked');assert.ok(f.calls.indexOf('refresh')<f.calls.indexOf('book'));
});
test('refresh failure or no shared time never books stale slots',async()=>{
 const failed=fixture({refresh:async()=>{throw Error('calendar revoked')}});
 await assert.rejects(runSlackBooking(failed.deps),/calendar revoked/);assert.deepEqual(failed.choices,[]);
 const none=fixture({slots:async()=>({revision:9,slots:[]})});assert.equal((await runSlackBooking(none.deps)).kind,'no_overlap');assert.deepEqual(none.choices,[]);
});
test('membership change during refresh is re-evaluated before booking',async()=>{
 const f=fixture();f.deps.refresh=async()=>f.set({...ready(),status:'awaiting_responses',responseSummary:{waitingFor:['new-person'],responded:2}});
 assert.equal((await runSlackBooking(f.deps)).kind,'waiting');assert.deepEqual(f.choices,[]);
});
test('delivery retry reuses original slot and revision without selecting another event',async()=>{
 const f=fixture();f.set({...ready(),status:'finalized',finalTime:{slotId:'original',basedOnRevision:3}});
 assert.equal((await runSlackBooking(f.deps)).kind,'booked');assert.deepEqual(f.choices,[{slotId:'original',revision:3}]);assert.ok(!f.calls.includes('refresh'));assert.ok(!f.calls.includes('slots'));
});
test('pending delivery is not reported as successfully booked',async()=>{
 const f=fixture({book:async()=>({...ready(),calendarEventCreated:false})});assert.equal((await runSlackBooking(f.deps)).kind,'delivery_pending');assert.deepEqual(f.pending,[true]);
});
test('already delivered and web-finalized meetings do not create another event',async()=>{
 const done=fixture();done.set({...ready(),calendarEventCreated:true});assert.equal((await runSlackBooking(done.deps)).kind,'booked');assert.deepEqual(done.calls,['read']);
 const web=fixture();web.set({...ready(),finalTime:{start:123,end:456}});assert.equal((await runSlackBooking(web.deps)).kind,'web_finalized');assert.deepEqual(web.calls,['read']);
});
