'use client';
import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
export type CalendarChoice='google'|'microsoft'|'apple';
export default function CalendarPicker({onClose,onConnect,invitationName='',mode='calendar'}:{onClose:()=>void;onConnect:(provider:CalendarChoice)=>Promise<void>;invitationName?:string;mode?:'signin'|'calendar'}){
 const dialog=useRef<HTMLDialogElement>(null),connecting=useRef(false),closing=useRef(false),closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [busy,setBusy]=useState(false),[isClosing,setClosing]=useState(false),[error,setError]=useState(''),[providers,setProviders]=useState<Record<CalendarChoice,boolean>|null>(null);
 useEffect(()=>{const d=dialog.current,previous=document.activeElement;d?.showModal();return()=>{if(closeTimer.current)clearTimeout(closeTimer.current);d?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus()}},[]);
 useEffect(()=>{const controller=new AbortController();fetch('/api/auth/calendar/providers',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(setProviders).catch(e=>{if(e.name!=='AbortError')setError('Could not load login options. Close and try again.')});return()=>controller.abort()},[]);
 function close(){
  if(connecting.current||closing.current)return;
  closing.current=true;setClosing(true);
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){onClose();return;}
  closeTimer.current=setTimeout(onClose,140);
 }
 async function connect(provider:CalendarChoice){if(connecting.current||closing.current)return;connecting.current=true;setBusy(true);setError('');try{await onConnect(provider)}catch(e){setError(e instanceof Error?e.message:'Could not continue.')}finally{connecting.current=false;setBusy(false)}}
 return <dialog ref={dialog} className="calendar-picker modal" data-closing={isClosing||undefined} aria-labelledby="calendar-picker-title" onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}}>
 <button type="button" className="modal-close icon-button" aria-label={mode==='signin'?'Close login options':'Close calendar options'} disabled={busy||isClosing} onClick={close}><X size={18}/></button>
 <h2 id="calendar-picker-title">{mode==='signin'?'Login to Wharf':'Link your calendar'}</h2>
 {invitationName&&<p>This invitation is for <strong>{invitationName}</strong>. Continue only if it was meant for you.</p>}
 {mode==='calendar'&&<p>Choose a calendar to share your availability.</p>}
 <div className="calendar-provider-options">
 {(['google','microsoft'] as const).map(provider=><button type="button" className="calendar-provider-option" key={provider} disabled={busy||isClosing||!providers?.[provider]} onClick={()=>void connect(provider)}><img className="provider-logo" src={'/identity/'+(provider==='google'?'google.png':'microsoft.svg')} width={20} height={20} alt=""/><span>{mode==='signin'?{google:'Continue with Google',microsoft:'Continue with Microsoft'}[provider]:{google:'Google Calendar',microsoft:'Outlook Calendar'}[provider]}</span></button>)}
 {mode==='signin'&&<button type="button" className="calendar-provider-option apple-signin-button" disabled={busy||isClosing||!providers?.apple} onClick={()=>void connect('apple')} aria-describedby="apple-signin-help"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.05 12.54c.03 3.26 2.86 4.34 2.89 4.35-.02.08-.45 1.55-1.49 3.07-.9 1.31-1.84 2.61-3.31 2.64-1.44.03-1.91-.85-3.56-.85-1.65 0-2.18.82-3.54.88-1.42.05-2.5-1.42-3.41-2.72-1.86-2.67-3.28-7.55-1.37-10.85a5.29 5.29 0 0 1 4.47-2.71c1.4-.03 2.72.94 3.57.94.86 0 2.46-1.16 4.14-.99.7.03 2.67.28 3.94 2.14-.1.06-2.35 1.37-2.33 4.1ZM14.33 4.5c.76-.92 1.27-2.2 1.13-3.48-1.1.04-2.43.73-3.22 1.65-.71.82-1.34 2.13-1.17 3.38 1.23.1 2.49-.63 3.26-1.55Z"/></svg><span>Continue with Apple</span></button>}
 </div>
 {mode==='signin'&&<p className="micro" id="apple-signin-help">{providers?.apple?'Apple login does not connect your iCloud calendar.':'Apple login is coming soon.'}</p>}
 <p className="calendar-picker-privacy"><a href="/privacy" target="_blank" rel="noreferrer">Privacy</a></p>
 {!providers&&!error&&<p className="sr-only" role="status">Loading options…</p>}{providers&&(['google','microsoft'] as const).filter(provider=>!providers[provider]).map(provider=><p key={provider} role="status">{provider==='google'?'Google':'Microsoft'} is unavailable right now.</p>)}
 {busy&&<p className="sr-only" role="status">Connecting…</p>}{error&&<p role="alert">{error}</p>}
 </dialog>;
}
