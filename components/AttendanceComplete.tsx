'use client';
import {useEffect,useRef} from 'react';
import {Check,X} from 'lucide-react';

export default function AttendanceComplete({onClose}:{onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const element=dialog.current;const previous=document.activeElement as HTMLElement|null;element?.showModal();return()=>{element?.close();previous?.focus()}},[]);
 return <dialog ref={dialog} className="modal attendance-complete" aria-labelledby="attendance-complete-title" aria-describedby="attendance-complete-description" onCancel={event=>{event.preventDefault();onClose()}}>
  <button className="modal-close icon-button" aria-label="Close confirmation" onClick={onClose}><X size={18}/></button>
  <div className="attendance-complete-check"><Check size={28} strokeWidth={2}/></div>
  <h2 id="attendance-complete-title">You’re all set.</h2>
  <p id="attendance-complete-description">Your availability has been shared. Once everyone has joined, the organizer will choose a time and you’ll receive a calendar invitation.</p>
  <p className="attendance-complete-note">You can close this page. There’s nothing else you need to do.</p>
  <button autoFocus className="primary full" onClick={onClose}>Got it <Check size={16}/></button>
 </dialog>;
}
