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

test('a failed participant provider refresh rejects before any snapshot or revision update',async()=>{
 let writes=0;
 class AgentError extends Error{code:string;constructor(code:string,message:string){super(message);this.code=code}}
 const {refreshAgentAvailability}=loadWithMocks<{refreshAgentAvailability:Function}>(new URL('../lib/agent-refresh.ts',import.meta.url),{
  './provider-connections':{providerConnection:async()=>({credential:'mock'}),readProviderAvailability:async()=>{throw Error('Invalid calendar response.')}},
  './auth':{sql:()=>async()=>{writes++;return [{changed:1}]}},
  './agent-api':{AgentError,loadAgentMeeting:async()=>({constraints:'{}',revision:1,people:[{googleSub:'icloud:person',name:'Person'}]})},
  './calendar-connection':{},'./google':{},'./token-vault':{},
  './availability':{allowed:()=>[{start:1,end:2}]},
  './calendar-intent':{captureAccountIntent:async()=>({accounts:[],expiresAt:'2100-01-01T00:00:00Z'}),runCalendarIntent:async(_intent:unknown,work:()=>Promise<unknown>)=>work()},
 });
 await assert.rejects(refreshAgentAvailability('meeting','mock-key'),(error:unknown)=>error instanceof AgentError&&error.code==='availability_refresh_failed');
 assert.equal(writes,0);
});
