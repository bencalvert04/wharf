import {test} from 'node:test';
import assert from 'node:assert/strict';
import {beginInviteCopy} from '../lib/invite-clipboard.ts';

test('starts clipboard write during the click and supplies the created URL later',async()=>{
 const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 const originalItem=Object.getOwnPropertyDescriptor(globalThis,'ClipboardItem');
 try{
  let started=false;let text='';
  class Item{data:Record<string,Promise<Blob>>;constructor(data:Record<string,Promise<Blob>>) {this.data=data}}
  Object.defineProperty(globalThis,'ClipboardItem',{configurable:true,value:Item});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{write:async(items:Item[])=>{started=true;text=await(await items[0].data['text/plain']).text()}}}});
  const copy=beginInviteCopy();assert.equal(started,true);assert.equal(text,'');
  copy.resolve('https://wharfmeetings.com/?meeting=test');
  assert.equal(await copy.result,true);assert.equal(text,'https://wharfmeetings.com/?meeting=test');
  const cancelled=beginInviteCopy();cancelled.cancel();assert.equal(await cancelled.result,false);
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{write:()=>Promise.reject(new Error('Denied'))}}});
  const denied=beginInviteCopy();denied.resolve('https://wharfmeetings.com/?meeting=test');assert.equal(await denied.result,false);
  Object.defineProperty(globalThis,'ClipboardItem',{configurable:true,value:undefined});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async(value:string)=>{text=value}}}});
  const fallback=beginInviteCopy();fallback.resolve('fallback');assert.equal(await fallback.result,true);assert.equal(text,'fallback');
 }finally{
  if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else Reflect.deleteProperty(globalThis,'navigator');
  if(originalItem)Object.defineProperty(globalThis,'ClipboardItem',originalItem);else Reflect.deleteProperty(globalThis,'ClipboardItem');
 }
});
