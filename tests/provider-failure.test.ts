import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadWithMocks} from './module-fixture.ts';

test('a failed provider read never replaces a joined meeting snapshot with free time',async()=>{
 let persisted=0;
 const {joinProviderMeeting}=loadWithMocks<{joinProviderMeeting:Function}>(new URL('../lib/provider-flow.ts',import.meta.url),{
  './auth':{},
  './meeting-participation':{persistCalendarSnapshot:async()=>{persisted++}},
  './provider-connections':{readProviderAvailability:async()=>{throw Error('Unsupported floating iCloud event time.')}},
  './calendar-intent':{currentCalendarIntent:()=>({accounts:[]})},
 });
 await assert.rejects(joinProviderMeeting({id:'meeting',constraints:'{}'},'icloud:person','Person','session',null),/Unsupported/);
 assert.equal(persisted,0);
});
