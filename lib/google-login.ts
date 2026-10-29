type LoginOptions={
 fetch:typeof fetch;
 location:()=>string;
 redirect:(url:string)=>void;
 setPending:(pending:boolean)=>void;
 setError:(message:string)=>void;
};

// A login attempt belongs to the page/view that started it, not to a cached
// component instance. In particular, Back from Google can restore that instance.
export function createGoogleLogin(options:LoginOptions){
 let current:{abort:AbortController;location:string;redirecting:boolean}|null=null;
 let disposed=false;
 function cancel(){
  if(!current)return;
  const attempt=current;current=null;attempt.abort.abort();
  if(!disposed)options.setPending(false);
 }
 async function start(){
  // React's disabled state is not committed until after the click handler.
  if(disposed||current)return;
  const attempt={abort:new AbortController(),location:options.location(),redirecting:false};
  current=attempt;options.setPending(true);options.setError('');
  try{
   const returnMeetingId=new URL(attempt.location).searchParams.get('meeting');
   const response=await options.fetch('/api/auth/google/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnMeetingId}),signal:attempt.abort.signal});
   const data=await response.json();
   if(current!==attempt)return;
   if(options.location()!==attempt.location){cancel();return}
   if(!response.ok)throw Error(typeof data?.error==='string'?data.error:'Could not sign in. Please try again.');
   if(typeof data?.url!=='string'||!data.url)throw Error('Could not sign in. Please try again.');
   attempt.redirecting=true;options.redirect(data.url);
  }catch(error){
   // Aborted/late responses must not redirect or overwrite a newer attempt.
   if(current!==attempt)return;
   current=null;options.setPending(false);
   options.setError(error instanceof Error?error.message:'Could not sign in. Please try again.');
  }
 }
 return {start,cancel,returned:()=>{if(current?.redirecting)cancel()},dispose:()=>{disposed=true;cancel()}};
}

export function watchGoogleLoginNavigation(login:ReturnType<typeof createGoogleLogin>,target:Pick<EventTarget,'addEventListener'|'removeEventListener'>){
 const interrupt=()=>login.cancel(),returned=()=>login.returned();
 const events=['pagehide','pageshow','popstate','hashchange'];
 for(const event of events)target.addEventListener(event,interrupt);
 // Some interrupted navigations leave the original document alive rather than
 // restoring it from the back/forward cache. Refocusing it must allow a retry.
 target.addEventListener('focus',returned);
 return()=>{for(const event of events)target.removeEventListener(event,interrupt);target.removeEventListener('focus',returned)};
}
