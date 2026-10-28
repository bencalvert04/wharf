import {test} from 'node:test';
import assert from 'node:assert/strict';
import {earliestSlotPrompt} from '../lib/slack-slot-prompt.ts';
test('suggests the earliest exact interval and binds confirmation to that meeting and slot',()=>{
 const prompt=earliestSlotPrompt('meeting',{revision:7,slots:[
 {id:'later',start:'2030-01-07T18:00:00Z',end:'2030-01-07T18:30:00Z',timezone:'America/Denver'},
 {id:'first',start:'2030-01-07T17:00:00Z',end:'2030-01-07T17:30:00Z',timezone:'America/Denver'}]});
 assert.match(prompt.text,/10:00 AM to 10:30 AM/);assert.match(prompt.text,/America\/Denver/);
 const action=(prompt.blocks[1] as any).elements[0];
 assert.equal(action.text.text,'Book meeting');assert.equal(action.action_id,'wharf_book');
 assert.deepEqual(JSON.parse(action.value),{id:'meeting',slotId:'first',revision:7});
});
test('no overlap produces a useful message with no booking button',()=>{
 const prompt=earliestSlotPrompt('meeting',{revision:8,slots:[]});
 assert.match(prompt.text,/no upcoming time fits/);assert.equal(prompt.blocks.length,1);
});
