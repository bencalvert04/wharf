'use client';
import {useState} from 'react';
import {Trash2} from 'lucide-react';

export default function DeleteMeetingButton({id,title,onDeleted}:{id:string;title:string;onDeleted:()=>void}) {
 const [deleting,setDeleting]=useState(false),[error,setError]=useState('');
 async function remove() {
  if(deleting||!window.confirm(`Delete "${title||'Untitled meeting'}"? This permanently removes the meeting and everyone's saved availability from Wharf. Existing calendar invitations will not be cancelled.`))return;
  setDeleting(true);setError('');
  try {
   const response=await fetch('/api/requests/'+encodeURIComponent(id),{method:'DELETE'});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Could not delete this meeting.');
   onDeleted();
  }catch(e){setError((e as Error).message);setDeleting(false)}
 }
 return <div className="delete-meeting"><button type="button" className="outline" disabled={deleting} onClick={remove} aria-label={`Delete ${title||'Untitled meeting'}`}><Trash2 size={14}/>{deleting?'Deleting…':'Delete meeting'}</button>{error&&<p role="alert">{error}</p>}</div>;
}
