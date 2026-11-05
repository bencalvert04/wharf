import {AsyncLocalStorage} from 'node:async_hooks';
import type {CalendarDatabase} from './calendar-connection-store.ts';
export type CalendarIntent={expiresAt:string;sessionId:string|null;sequence:string|null;accounts:{account:string;sequence:string}[]};
const context=new AsyncLocalStorage<CalendarIntent>();
export const currentCalendarIntent=()=>context.getStore();
export function runCalendarIntent<T>(intent:CalendarIntent,work:()=>Promise<T>):Promise<T>{
 if(!intent||!Array.isArray(intent.accounts))throw Error('Calendar flow expired. Please start again.');
 return context.run(intent,work);
}
export async function beginCalendarIntent(db:CalendarDatabase,sessionId:string,expectedAccount?:string|null,accountWide=true){
 const [row]=await db`SELECT wharf_begin_calendar_intent(${sessionId},${expectedAccount??null},${expectedAccount!==undefined},${accountWide}) AS intent`;
 return row.intent as CalendarIntent;
}
export async function bindCalendarAccount(db:CalendarDatabase,account:string){
 const intent=currentCalendarIntent();if(!intent)throw Error('Missing calendar intent.');
 const [row]=await db`SELECT wharf_bind_calendar_account(${JSON.stringify(intent)}::jsonb,${account}) AS intent`;
 intent.accounts=row.intent.accounts;
}
export async function captureAccountIntent(db:CalendarDatabase,account:string){
 const [row]=await db`SELECT wharf_capture_calendar_account(${account}) AS intent`;
 return row.intent as CalendarIntent;
}
export async function captureSessionIntent(db:CalendarDatabase,sessionId:string,account:string){
 const [row]=await db`SELECT wharf_capture_calendar_session(${sessionId},${account}) AS intent`;
 return row.intent as CalendarIntent;
}
// Neon HTTP transactions are non-interactive. Keep query promises lazy and prepend
// the guard to the SAME transaction as the real statements. The advisory lock is
// held only for this short DB transaction, never across a provider/network call.
const rawQuery=Symbol('calendar raw query');
export function guardCalendarDatabase(db:CalendarDatabase):CalendarDatabase{
 const intent=currentCalendarIntent();if(!intent)return db;
 const raw=db as any;
 const execute=(queries:any[],options?:any)=>{
  if(options?.isolationLevel&&options.isolationLevel!=='ReadCommitted')throw Error('Calendar intent transactions require ReadCommitted isolation.');
  return raw.transaction([
  raw`SELECT wharf_assert_calendar_intent(${JSON.stringify(intent)}::jsonb)`,
  ...queries.map(q=>q?.[rawQuery]??q),
 ],{...options,isolationLevel:'ReadCommitted'}).then((results:any[])=>results.slice(1));
 };
 const wrap=(query:any)=>({[rawQuery]:query,then:(resolve:any,reject:any)=>execute([query]).then((results:any[])=>results[0]).then(resolve,reject)});
 const guarded=((strings:TemplateStringsArray,...values:unknown[])=>wrap(raw(strings,...values))) as any;
 guarded.query=(query:string,values?:unknown[],options?:unknown)=>wrap(raw.query(query,values,options));
 guarded.transaction=(queries:any[]|((sql:any)=>any[]),options?:unknown)=>execute(typeof queries==='function'?queries(raw):queries,options);
 return guarded as CalendarDatabase;
}
