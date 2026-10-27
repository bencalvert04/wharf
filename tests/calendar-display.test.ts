import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarDisplayRange,calendarTickLabel} from '../lib/calendar-display.ts';
const base={title:'Meeting',start:'2026-10-27',end:'2026-10-27',duration:30,zone:'America/Denver',from:'00:00',to:'24:00',days:[0,1,2,3,4,5,6]};
test('continuous agent meeting displays requested hours, not full-day storage bounds',()=>{
 const range=calendarDisplayRange({...base,windowStart:'2026-10-27T09:00',windowEnd:'2026-10-27T17:00'},['2026-10-27']);
 assert.equal(range.startMinute,540);assert.equal(range.endMinute,1020);assert.deepEqual(range.ticks,[540,600,660,720,780,840,900,960,1020]);
});
test('exact minute boundaries are visible and daily meetings retain their hours',()=>{
 const range=calendarDisplayRange({...base,windowStart:'2026-10-27T09:15',windowEnd:'2026-10-27T17:10'},['2026-10-27']);
 assert.equal(range.ticks[0],555);assert.equal(range.ticks.at(-1),1030);assert.equal(calendarTickLabel(555),'9:15 AM');assert.equal(calendarTickLabel(1440),'12 AM');
 assert.equal(calendarDisplayRange({...base,from:'10:00',to:'16:00'},['2026-10-27']).startMinute,600);
});
test('overnight intervals preserve midnight coverage and crop individual pages',()=>{
 const c={...base,end:'2026-10-28',windowStart:'2026-10-27T20:00',windowEnd:'2026-10-28T09:00'};
 assert.deepEqual([calendarDisplayRange(c,['2026-10-27','2026-10-28']).startMinute,calendarDisplayRange(c,['2026-10-27','2026-10-28']).endMinute],[0,1440]);
 assert.equal(calendarDisplayRange(c,['2026-10-27']).startMinute,1200);
 assert.equal(calendarDisplayRange(c,['2026-10-28']).endMinute,540);
});
