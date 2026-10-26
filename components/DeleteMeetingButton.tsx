'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Trash2,X} from 'lucide-react';

export default function DeleteMeetingButton({id,title,onDeleted,scope='everyone'}:{id:string;title:string;onDeleted:()=>void;scope?:'everyone'|'personal'}) {
 const personal=scope==='personal';
 const [open,setOpen]=useState(false),[deleting,setDeleting]=useState(false),[error,setError]=useState('');
 const dialog=useRef<HTMLDialogElement>(null),pending=useRef(false);
 const heading=useId(),description=useId();
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close()},[open]);
 function dismiss(){if(!pending.current)setOpen(false)}
 async function remove() {
  if(pending.current)return;
  pending.current=true;setDeleting(true);setError('');
  try {
   const response=await fetch('/api/requests/'+encodeURIComponent(id)+(personal?'/pending':''),{method:'DELETE'});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Could not delete this meeting.');
   dialog.current?.close();setOpen(false);onDeleted();
  }catch(e){setError((e as Error).message)}
  finally{pending.current=false;setDeleting(false)}
 }
 return <>
  <div className="delete-meeting"><button type="button" className="outline" disabled={deleting} onClick={()=>{setError('');setOpen(true)}} aria-label={`${personal?'Remove from Pending:':'Delete for everyone:'} ${title||'Untitled meeting'}`}><Trash2 size={14}/>{personal?'Remove from Pending':'Delete for everyone'}</button></div>
  <dialog ref={dialog} className="delete-dialog" aria-labelledby={heading} aria-describedby={description} onCancel={event=>{event.preventDefault();dismiss()}} onClose={()=>setOpen(false)} onClick={event=>{if(event.target===event.currentTarget){const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dismiss()}}}>
   <div className="delete-dialog-heading"><span className="eyebrow"><Trash2 size={14}/>{personal?'REMOVE FROM PENDING':'DELETE MEETING'}</span><button type="button" className="icon-button" aria-label="Close confirmation" disabled={deleting} onClick={dismiss}><X size={18}/></button></div>
   <h2 id={heading}>{personal?'Remove from your Pending meetings?':'Delete this meeting for everyone?'}</h2>
   <div className="delete-dialog-name">{title||'Untitled meeting'}</div>
   <div id={description}>{personal?<><p>This removes the meeting from your Pending list only. It stays available to everyone else.</p><p className="delete-dialog-note">This does not remove your availability or cancel an invitation. You can restore it by opening the original meeting link.</p></>:<><p>The meeting and everyone’s saved availability will be permanently removed from Wharf.</p><p className="delete-dialog-note">This can’t be undone. Google Calendar events and invitations already sent will remain. Cancel them in Google Calendar.</p></>}</div>
   {error&&<p role="alert" className="delete-dialog-error">{error}</p>}
   <div className="delete-dialog-actions"><button type="button" className="outline" autoFocus disabled={deleting} onClick={dismiss}>{personal?'Keep in Pending':'Keep meeting'}</button><button type="button" className="primary" disabled={deleting} onClick={remove}><Trash2 size={14}/>{deleting?'Removing…':personal?'Remove from Pending':'Delete for everyone'}</button></div>
  </dialog>
 </>;
}
