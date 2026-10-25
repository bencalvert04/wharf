import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isSameOrigin} from '../lib/request-origin.ts';
const configured='https://wharf-delta.vercel.app';
test('same-origin mutations work on production and deployment aliases',()=>{
 for(const origin of ['https://wharfmeetings.com','https://wharf-preview.vercel.app','http://localhost:3019']){
  assert.equal(isSameOrigin(new Request(origin+'/api/requests/test',{method:'DELETE',headers:{Origin:origin}}),configured),true);
 }
});
test('unrelated origins and null origins cannot mutate meetings',()=>{
 for(const origin of ['https://untrusted.example','https://wharfmeetings.com.evil.example','null']){
  assert.equal(isSameOrigin(new Request('https://wharfmeetings.com/api/requests/test',{method:'DELETE',headers:{Origin:origin}}),configured),false);
 }
});
test('server clients without Origin and configured origin remain supported',()=>{
 assert.equal(isSameOrigin(new Request(configured+'/api/requests/test'),configured),true);
 assert.equal(isSameOrigin(new Request('https://wharfmeetings.com/api/requests/test',{headers:{Origin:configured}}),configured),true);
});
