// Leave 20 seconds of a 60-second route for database cleanup and finalization.
export class CalendarDeadlineError extends Error{}
export const calendarRefreshBudgetMs=40_000;
export async function withCalendarDeadline<T>(work:(signal:AbortSignal)=>Promise<T>,milliseconds=calendarRefreshBudgetMs):Promise<T>{
 const controller=new AbortController();
 let timer:ReturnType<typeof setTimeout>;
 const expired=new Promise<never>((_,reject)=>{
  timer=setTimeout(()=>{
   const error=new CalendarDeadlineError('Calendar check timed out. Please refresh again. Last known availability is shown.');
   controller.abort(error);reject(error);
  },milliseconds);
 });
 try{return await Promise.race([work(controller.signal),expired])}
 finally{clearTimeout(timer!);controller.abort();}
}
export function calendarRequestSignal(signal?:AbortSignal){
 return signal?AbortSignal.any([signal,AbortSignal.timeout(15_000)]):AbortSignal.timeout(15_000);
}
