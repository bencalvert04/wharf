import {test} from 'node:test';
import assert from 'node:assert/strict';
import {meetingSlot} from '../lib/meeting-slot.ts';
const start=Date.parse('2026-10-26T09:00:00Z');
const w={start,end:start+120*60000,date:'2026-10-26',people:['Ben']};
test('45 minute hover slots move within a two hour window',()=>{for(const [position,minutes] of [[0,0],[.25,30],[.5,60],[1,75]]){const slot=meetingSlot(w,45,position);assert.equal(slot.start,start+minutes*60000);assert.equal(slot.end-slot.start,45*60000);assert.ok(slot.end<=w.end)}});
test('clamps pointer overshoot and preserves irregular duration',()=>{assert.equal(meetingSlot(w,45,-1).start,start);const slot=meetingSlot(w,40,2);assert.equal(slot.start,start+75*60000);assert.equal(slot.end-slot.start,40*60000)});
test('exact fit and shorter fallback remain inside availability',()=>{assert.deepEqual(meetingSlot(w,120,1),w);assert.deepEqual(meetingSlot(w,180,.5),w)});
