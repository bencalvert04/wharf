import {test} from 'node:test';
import assert from 'node:assert/strict';
import {samplePeople} from '../lib/demo.ts';
import {shared,type Constraints} from '../lib/availability.ts';
const c:Constraints={title:'lucid demo',start:'2026-10-26',end:'2026-10-26',duration:45,zone:'UTC',from:'09:00',to:'17:00',days:[1]};
test('demo has four clearly marked samples and no Ben Calvert',()=>{const samples=samplePeople(c);assert.deepEqual(samples.map(p=>p.name),['Ray Shaw','Dave Grow','Seamus Hennessy','Ben Dilts']);assert.ok(samples.every(p=>p.sample))});
test('personal availability narrows the sample overlap',()=>{const samples=samplePeople(c);const before=shared(c,samples);assert.ok(before.length);const after=shared(c,[...samples,{name:'Me',busy:[{start:Date.parse('2026-10-26T00:00Z'),end:Date.parse('2026-10-27T00:00Z')}]}]);assert.deepEqual(after,[])});
