'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,ChevronLeft,X,CalendarDays} from 'lucide-react';
export type CalendarChoice='google'|'microsoft'|'icloud';
export type AppleLogin={username:string;password:string};
export default function CalendarPicker({onClose,onConnect,invitationName='',planner=false}:{onClose:()=>void;onConnect:(provider:CalendarChoice,credentials?:AppleLogin)=>Promise<void>;invitationName?:string;planner?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null),connecting=useRef(false);
 const [apple,setApple]=useState(false),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[providers,setProviders]=useState<Record<CalendarChoice,boolean>|null>(null);
 useEffect(()=>{const d=dialog.current;d?.showModal();return()=>d?.close()},[]);
 useEffect(()=>{const controller=new AbortController();fetch('/api/auth/calendar/providers',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(setProviders).catch(e=>{if(e.name!=='AbortError')setError('Could not load calendar options. Close and try again.')});return()=>controller.abort()},[]);
 async function connect(provider:CalendarChoice){if(connecting.current)return;connecting.current=true;setBusy(true);setError('');try{await onConnect(provider,provider==='icloud'?{username,password}:undefined);setPassword('')}catch(e){setError(e instanceof Error?e.message:'Could not connect your calendar.')}finally{connecting.current=false;setBusy(false)}}
 return <dialog ref={dialog} className="calendar-picker modal" aria-labelledby="calendar-picker-title" onCancel={e=>{e.preventDefault();if(!busy)onClose()}} onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}>
 <button type="button" className="modal-close icon-button" aria-label="Close calendar options" disabled={busy} onClick={onClose}><X size={18}/></button>
 {apple&&<button type="button" className="text-button" disabled={busy} onClick={()=>{setApple(false);setPassword('');setError('')}}><ChevronLeft size={14}/> Calendar options</button>}
 <CalendarDays size={24}/><h2 id="calendar-picker-title">{apple?'Connect iCloud Calendar':'Link your calendar'}</h2>
 {invitationName&&<p>This invitation is for <strong>{invitationName}</strong>. Continue only if it was meant for you.</p>}
 {apple?<form onSubmit={e=>{e.preventDefault();void connect('icloud')}}>
 <p>Use your Apple Account email and an <a href="https://account.apple.com/" target="_blank" rel="noreferrer">app-specific password</a> created under Sign-In and Security. Keep your regular Apple password private.</p>
 <label htmlFor="apple-calendar-email">Apple Account email</label><input id="apple-calendar-email" type="email" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required maxLength={254} disabled={busy}/>
 <label htmlFor="apple-calendar-password">App-specific password</label><input id="apple-calendar-password" type="password" autoComplete="off" spellCheck={false} value={password} onChange={e=>setPassword(e.target.value)} required maxLength={32} disabled={busy}/>
 <p className="micro">Apple’s password allows calendar access, including event details and writes. Wharf uses read requests to calculate busy times across your iCloud calendars and stores only those time ranges. The password is encrypted on the server. Revoke it in your Apple Account anytime.</p>
 <button type="submit" className="primary full" disabled={busy||!username||!password}>{busy?'Connecting…':'Connect iCloud Calendar'} <ArrowRight size={15}/></button>
 </form>:<>
 <p>Choose where your calendar is stored. Wharf uses its availability to find a time for the group.</p>
 <div className="calendar-provider-options">
 {(['google','microsoft','icloud'] as const).map(provider=><button type="button" className="calendar-provider-option" key={provider} disabled={busy||!providers?.[provider]} onClick={()=>provider==='icloud'?setApple(true):void connect(provider)}><span className={'provider-mark '+provider} aria-hidden="true">{provider==='google'?'G':provider==='microsoft'?'M':'i'}</span><span><strong>{{google:'Google Calendar',microsoft:'Outlook Calendar',icloud:'iCloud Calendar'}[provider]}</strong><small>{providers&&!providers[provider]?'Setup required':{google:'Google accounts',microsoft:'Personal, work, and school accounts',icloud:'Apple Account · app-specific password'}[provider]}</small></span><ArrowRight size={16}/></button>)}
 </div>
 <p className="micro">Google shares free/busy times. {planner&&<>As the planner, you also allow Wharf to create meetings you confirm in Google Calendar and send invitations. </>}Outlook grants basic calendar read access; Wharf requests only times and availability status from your primary calendar. Your name and shared availability are visible to meeting participants. Your email is used for meeting invitations. <a href="/privacy" target="_blank" rel="noreferrer">Privacy</a></p>
 </>}
 {busy&&<p role="status">Connecting your calendar…</p>}{error&&<p role="alert">{error}</p>}
 </dialog>;
}
