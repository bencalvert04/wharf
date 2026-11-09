'use client';
import {useEffect,useRef,useState} from 'react';
import {MessageSquare,X,Check,ArrowUpRight} from 'lucide-react';
const emailLink='mailto:raycshaw36@gmail.com,bencalvert04@gmail.com?subject=Wharf%20feedback';
export default function FeedbackButton({page='other',preview=false}:{page?:string;preview?:boolean}){
 const [open,setOpen]=useState(preview),[isPreview,setPreview]=useState(preview);
 useEffect(()=>{if(process.env.NODE_ENV==='development'&&new URLSearchParams(location.search).get('preview')==='feedback'){setPreview(true);setOpen(true)}},[]);
 return <><button className="feedback-trigger" onClick={()=>setOpen(true)}><MessageSquare size={15}/> Feedback or report a problem</button>{open&&<FeedbackDialog page={page} preview={isPreview} onClose={()=>setOpen(false)}/>}</>;
}
function FeedbackDialog({page,preview,onClose}:{page:string;preview:boolean;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),id=useRef('');
 const [kind,setKind]=useState<'problem'|'idea'>('problem'),[message,setMessage]=useState(''),[email,setEmail]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState('');
 useEffect(()=>{id.current=crypto.randomUUID();const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>{dialog.current?.close();previous?.focus()}},[]);
 async function submit(e:React.FormEvent){e.preventDefault();setError('');if(preview){setSent(true);return}setBusy(true);try{const response=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id.current,kind,message,email,page})});const data=await response.json();if(!response.ok)throw Error(data.error||'Could not send your message.');setSent(true)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <dialog ref={dialog} className="feedback-dialog" aria-labelledby="feedback-title" onCancel={e=>{e.preventDefault();if(!busy)onClose()}}>
 <button className="feedback-close" aria-label="Close feedback" disabled={busy} onClick={onClose}><X size={19}/></button>
 {sent?<div className="feedback-success"><span className="feedback-success-icon"><Check size={28}/></span><h2 id="feedback-title">{preview?'That’s the confirmation.':'Thanks for letting us know.'}</h2><p>{preview?'This is a preview. No email was sent.':'Your message has been sent to Ray and Ben. If you left an email, we can reply there.'}</p><button className="feedback-send" onClick={onClose}>Done</button></div>:<form onSubmit={submit}>
 <span className="feedback-eyebrow">A direct line to the founders</span><h2 id="feedback-title">How can we improve Wharf?</h2><p className="feedback-intro">Something not working, or have an idea? Ray and Ben will get your message.</p>
 {preview&&<p className="feedback-preview">Preview only · Sending won’t email anyone</p>}
 <fieldset className="feedback-types"><legend className="sr-only">Feedback type</legend><label><input type="radio" name="feedback-kind" checked={kind==='problem'} onChange={()=>setKind('problem')}/>Report a problem</label><label><input type="radio" name="feedback-kind" checked={kind==='idea'} onChange={()=>setKind('idea')}/>Share an idea</label></fieldset>
 <label className="feedback-field" htmlFor="feedback-message">{kind==='problem'?'What happened?':'What’s your idea?'}<textarea id="feedback-message" required minLength={10} maxLength={3000} value={message} onChange={e=>setMessage(e.target.value)} placeholder={kind==='problem'?'Tell us what you were trying to do and what went wrong.':'What would make Wharf more useful for you?'} rows={5}/></label>
 <label className="feedback-field" htmlFor="feedback-email">Your email <span>(optional, for a reply)</span><input id="feedback-email" type="email" maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label>
 <p className="feedback-privacy">Please don’t include passwords or private calendar details. We only attach the screen name—not your meeting link or calendar.</p>
 {error&&<p className="feedback-error" role="alert">{error}</p>}
 <button className="feedback-send" disabled={busy||message.trim().length<10} type="submit">{busy?'Sending…':preview?'Preview confirmation':'Send to Ray & Ben'}<ArrowUpRight size={16}/></button>
 <a className="feedback-email-link" href={emailLink}>Prefer to email us directly?</a>
 </form>}
 </dialog>;
}
