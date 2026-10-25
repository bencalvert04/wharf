import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBusy} from '../lib/calendar-data.ts';
import {shared,type Constraints} from '../lib/availability.ts';
const c:Constraints={title:'Test',start:'2026-10-26',end:'2026-10-26',from:'09:00',to:'17:00',days:[1],duration:30,zone:'UTC'};
test('missing or partial Google responses fail closed',()=>{for(const response of [{},{calendars:{primary:{errors:[{reason:'notFound'}],busy:[]}}},{calendars:{primary:{busy:[{start:'oops',end:'oops'}]}}}])assert.throws(()=>parseBusy(response,c))});
test('Google snapshot is clipped to requested working hours',()=>{assert.deepEqual(parseBusy({calendars:{primary:{busy:[{start:'2026-10-26T08:00:00Z',end:'2026-10-26T10:00:00Z'},{start:'2026-10-27T09:00:00Z',end:'2026-10-27T10:00:00Z'}]}}},c),[{start:Date.parse('2026-10-26T09:00:00Z'),end:Date.parse('2026-10-26T10:00:00Z')}])});
test('a genuinely empty calendar remains available',()=>assert.deepEqual(parseBusy({calendars:{primary:{busy:[]}}},c),[]));
test('busy intervals ending in seconds round up to a quarter hour',()=>{const result=shared(c,[{name:'Test',busy:[{start:Date.parse('2026-10-26T09:00Z'),end:Date.parse('2026-10-26T09:15:30Z')}]}]);assert.equal(result[0].start,Date.parse('2026-10-26T09:30Z'))});
