import {test} from 'node:test';
import assert from 'node:assert/strict';
import {availabilityRevision,validFinalSlot} from '../lib/finalization.ts';
const c={title:'Planning',start:'2026-11-02',end:'2026-11-02',duration:30,zone:'America/Denver',from:'09:00',to:'17:00',days:[1]};
const now=Date.parse('2026-11-01T00:00Z'),start=Date.parse('2026-11-02T16:00Z');
const people=[{name:'Planner',google_sub:'1',email:'planner@example.com',busy:[]},{name:'Guest',google_sub:'2',email:'guest@example.com',busy:[{start:start+3600000,end:start+7200000}]}];
test('finalization accepts an exact shared future slot, including the planner',()=>assert.equal(validFinalSlot(c,people,start,start+1800000,now),true));
test('finalization rejects short, busy, past, off-grid and out-of-hours selections',()=>{
 for(const [a,b] of [[start,start+900000],[start+3600000,start+5400000],[start+60000,start+1860000],[start-3600000,start-1800000]])assert.equal(validFinalSlot(c,people,a,b,now),false);
 assert.equal(validFinalSlot(c,people,start,start+1800000,start),false);
 assert.equal(validFinalSlot(c,[],start,start+1800000,now),false);
 assert.equal(validFinalSlot(c,people,String(start),start+1800000,now),false);
});
test('revision ignores result ordering but changes with membership, email or busy times',()=>{
 const revision=availabilityRevision(people);
 assert.equal(availabilityRevision([...people].reverse()),revision);
 assert.notEqual(availabilityRevision(people.slice(1)),revision);
 assert.notEqual(availabilityRevision(people.map(p=>({...p,email:'new@example.com'}))),revision);
 assert.notEqual(availabilityRevision(people.map(p=>({...p,busy:[]}))),revision);
});
