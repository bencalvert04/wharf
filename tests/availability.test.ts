import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {shared,allowed,validate,type Constraints} from '../lib/availability.ts';
const c:Constraints={title:'Test',start:'2026-10-26',end:'2026-10-26',duration:60,zone:'UTC',from:'09:00',to:'12:00',days:[1]};
const t=(s:string)=>Date.parse('2026-10-26T'+s+':00Z');
test('intersects busy intervals and aligns starts to local quarter hours',()=>{const w=shared(c,[{name:'A',busy:[{start:t('09:00'),end:t('09:07')},{start:t('10:10'),end:t('11:00')}]},{name:'B',busy:[{start:t('11:30'),end:t('12:00')}]}]);assert.deepEqual(w.map(x=>[x.start,x.end]),[[t('09:15'),t('10:10')],[t('11:00'),t('11:30')]])});
test('retains a 40 minute shorter option without rounding its end',()=>{const w=shared({...c,to:'10:00'},[{name:'A',busy:[{start:t('09:40'),end:t('10:00')}]}]);assert.equal((w[0].end-w[0].start)/60000,40)});
test('drops fragments shorter than 15 minutes',()=>{assert.equal(shared({...c,to:'09:10'},[]).length,0)});
test('handles local spring-forward hours',()=>{const windows=allowed({...c,start:'2026-03-08',end:'2026-03-08',zone:'America/Denver',from:'01:00',to:'04:00',days:[0]});assert.equal(windows.reduce((sum,w)=>sum+w.end-w.start,0)/3600000,2)});
test('handles local fall-back hours',()=>{const windows=allowed({...c,start:'2026-11-01',end:'2026-11-01',zone:'America/Denver',from:'01:00',to:'04:00',days:[0]});assert.equal(windows.reduce((sum,w)=>sum+w.end-w.start,0)/3600000,4)});
test('rejects invalid dates and unbounded date ranges',()=>{assert.throws(()=>validate({...c,start:'2026-02-30'}));assert.throws(()=>validate({...c,end:'2027-01-01'}));assert.throws(()=>validate({...c,days:[]}));});
test('continuous deadline includes overnight hours but excludes times outside its endpoints',()=>{
 const range={...c,start:'2026-10-26',end:'2026-10-27',from:'00:00',to:'24:00',days:[0,1,2,3,4,5,6],windowStart:'2026-10-26T16:37',windowEnd:'2026-10-27T18:00'};
 validate(range);const windows=allowed(range);
 assert.deepEqual(windows.map(w=>[new Date(w.start).toISOString(),new Date(w.end).toISOString()]),[['2026-10-26T16:37:00.000Z','2026-10-27T00:00:00.000Z'],['2026-10-27T00:00:00.000Z','2026-10-27T18:00:00.000Z']]);
});
test('after 8 PM ends at midnight, including the final minute',()=>{
 const range={...c,from:'00:00',to:'24:00',windowStart:'2026-10-26T20:00',windowEnd:'2026-10-26T24:00'};validate(range);
 assert.equal(allowed(range)[0].end,Date.parse('2026-10-27T00:00Z'));
 assert.equal(allowed(range)[0].start,Date.parse('2026-10-26T20:00Z'));
 assert.throws(()=>validate({...range,windowEnd:'2026-10-26T19:00'}));
 assert.throws(()=>validate({...range,windowEnd:'2026-10-27T24:00'}));
 assert.throws(()=>validate({...range,windowEnd:'2026-10-26T24:01'}));
});
