import {test} from 'node:test';
import assert from 'node:assert/strict';
import {describeAgentMeeting} from '../lib/agent-view.ts';
import {agentQuickstart,discovery} from '../lib/agent-discovery.ts';
import {agentOpenApi} from '../lib/agent-openapi.ts';
import {createMeetingSchema,toConstraints} from '../lib/agent-contract.ts';
const base='https://wharf.example',key='a-secret-that-must-never-appear';
const constraints=toConstraints(createMeetingSchema.parse({startDate:'2099-01-07',timezone:'UTC',participants:[{id:'ben',name:'Ben'},{id:'ray',name:'Ray'}]}));
function row(overrides:Record<string,unknown>={}){return {id:'8e58d822-b685-42e1-b476-947bc44425e7',constraints:JSON.stringify(constraints),revision:4,created_at:'2099-01-01T00:00:00Z',invitees:[{id:'ben',name:'Ben',googleSub:'sub-ben'},{id:'ray',name:'Ray',googleSub:'sub-ray'}],people:[{googleSub:'sub-ben',name:'Ben',busy:[],capturedAt:'2099-01-01T00:00:00Z'},{googleSub:'sub-ray',name:'Ray',busy:[],capturedAt:'2099-01-01T00:00:00Z'}],...overrides};}
function view(overrides:Record<string,unknown>={}){return describeAgentMeeting(row(overrides),key,base);}
test('one status read provides bounded slot choices and matching request templates, never the key or busy data',()=>{
 const result=view();assert.equal(result.status,'ready');assert.equal(result.availability.slots.length,5);assert.equal(result.availability.nextOffset,5);
 const action=result.actions.find(a=>a.id==='finalize')!;
 assert.equal(action.url,`${base}/api/v1/meetings/${result.id}/finalize`);
 assert.deepEqual(action.body,{revision:result.revision});assert.deepEqual(action.requiredInput,['slotId']);
 assert.equal(action.sendsInvitations,false);assert.equal(action.requiresUserChoice,true);
 assert.equal(result.actions.some(a=>a.id==='book'),false);
 assert.ok(!JSON.stringify(result).includes(key));assert.ok(!JSON.stringify(result).includes('sub-ben'));assert.ok(!JSON.stringify(result).includes('"busy"'));
});
test('partial responses cannot advertise slots or confirmation; polling is bounded',()=>{
 const result=view({people:row().people.slice(0,1)});
 assert.equal(result.status,'awaiting_responses');assert.deepEqual(result.responseSummary.waitingFor,['ray']);
 assert.deepEqual(result.availability.slots,[]);assert.equal(result.availability.nextOffset,null);
 assert.equal(result.actions[0].pollAfterSeconds,30);assert.equal(result.actions.some(a=>['book','finalize','get_slots'].includes(a.id)),false);
});
test('authorized ready meeting advertises booking with explicit invitation side effect and unresolved slot choice',()=>{
 const result=view({calendar_authorization:{participantId:'ben',authorized:true}});
 const action=result.actions.find(a=>a.id==='book')!;
 assert.equal(action.sendsInvitations,true);assert.deepEqual(action.requiredInput,['slotId']);
 assert.deepEqual(action.tool?.arguments,{meetingId:result.id,revision:4});
 assert.deepEqual(result.actions.find(a=>a.id==='prepare_calendar')?.body,{organizerParticipantId:'ben'});
});
test('pending booking recovery uses original revision, including after the slot time passed',()=>{
 const final={slotId:'saved-slot',basedOnRevision:2,start:'2020-01-01T09:00:00Z'};
 const result=view({revision:5,final_time:final,calendar_event:{status:'pending'},calendar_authorization:{participantId:'ben',authorized:false}});
 const retry=result.actions.find(a=>a.id==='retry_booking')!;
 assert.deepEqual(retry.body,{slotId:'saved-slot',revision:2});assert.equal(retry.pollAfterSeconds,30);assert.deepEqual(retry.requiredInput,[]);
 assert.equal(result.actions.some(a=>a.id==='finalize'||a.id==='book'),false);
 assert.ok(result.actions.some(a=>a.id==='prepare_calendar'));
});
test('created event is done, save-only future time can be booked, expired choice is not advertised',()=>{
 const final={slotId:'saved-slot',basedOnRevision:2,start:'2099-01-07T09:00:00Z'};
 assert.deepEqual(view({final_time:final,calendar_event:{status:'created'}}).actions.map(a=>a.id),['check_status']);
 const result=view({final_time:final,calendar_authorization:{participantId:'ben',authorized:true}});
 assert.deepEqual(result.actions.find(a=>a.id==='book')?.body,{slotId:'saved-slot',revision:2});
 assert.equal(view({final_time:{...final,start:'2020-01-01T09:00:00Z'},calendar_authorization:{participantId:'ben',authorized:true}}).actions.some(a=>a.id==='book'),false);
});
test('open group meetings preserve the human planner handoff without inferring a complete roster',()=>{
 const result=view({constraints:JSON.stringify({...constraints,openJoin:true})});
 assert.deepEqual(result.actions.map(a=>a.id),['check_status','open_meeting']);
 assert.equal(result.actions[1].authentication,'none');assert.equal(result.actions[1].url,result.invitationUrl);
});
test('no overlap and short availability produce correct empty or terminal previews',()=>{
 const allDay=[{start:Date.parse('2099-01-07T00:00Z'),end:Date.parse('2099-01-08T00:00Z')}];
 const result=view({people:row().people.map(p=>({...p,busy:allDay}))});
 assert.equal(result.status,'no_overlap');assert.deepEqual(result.availability.slots,[]);assert.ok(!result.actions.some(a=>a.id==='finalize'));
 const short=view({constraints:JSON.stringify({...constraints,from:'09:00',to:'09:30'})});
 assert.equal(short.availability.slots.length,1);assert.equal(short.availability.nextOffset,null);
});
test('discovery examples validate and OpenAPI documents actions, slots and open meeting state',()=>{
 const quickstart=agentQuickstart(base);
 for(const body of Object.values(quickstart.create.examples))assert.ok(createMeetingSchema.safeParse(body).success);
 const doc=discovery(base),spec=agentOpenApi(base);
 assert.equal(doc.limits.participants,1000);assert.equal(doc.version,spec.info.version);
 assert.ok(spec.components.schemas.Meeting.properties.actions);
 assert.ok(spec.components.schemas.Action.properties.requiredInput);
 const next=spec.components.schemas.CalendarAuthorization.properties.nextAction as {properties:{type:{enum:string[]}}};assert.ok(next.properties.type.enum.includes('open_meeting'));
});
