import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isPendingMeeting} from '../lib/pending-meetings.ts';
import type {Constraints} from '../lib/availability.ts';

const c:Constraints={title:'Planning',start:'2026-10-26',end:'2026-10-30',duration:30,zone:'America/Denver',from:'09:00',to:'17:00',days:[1,2,3,4,5]};
test('requests without a final time are pending, including past date ranges',()=>{
 assert.equal(isPendingMeeting(c),true);
 assert.equal(isPendingMeeting({...c,start:'2020-01-01',end:'2020-01-01'}),true);
});
test('selecting a final time removes a request from pending',()=>{
 assert.equal(isPendingMeeting(c,'2026-10-26T15:00:00Z'),false);
 assert.equal(isPendingMeeting(c,{start:'2026-10-26T15:00:00Z',end:'2026-10-26T15:30:00Z'}),false);
});
test('clearing a final time makes a request pending again',()=>{
 assert.equal(isPendingMeeting(c,null),true);
});
test('sample meetings stay out of the personal pending list',()=>{
 assert.equal(isPendingMeeting({...c,demo:true}),false);
});
