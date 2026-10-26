'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,CalendarDays,Clock3,Users} from 'lucide-react';
import DeleteMeetingButton from './DeleteMeetingButton';
import type {PendingMeeting} from '@/lib/pending-meetings';

export default function PendingMeetings({onCreate}:{onCreate:()=>void}) {
 const deleted=useRef(new Set<string>());
 const [meetings,setMeetings]=useState<PendingMeeting[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  const refresh=async()=>{
   try {
    const response=await fetch('/api/requests',{cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'Could not load pending meetings.');
    if(active){setMeetings(data.meetings.filter((m:PendingMeeting)=>!deleted.current.has(m.id)));setError('')}
   }catch(e){if(active)setError((e as Error).message)}
   finally{if(active)setLoading(false)}
  };
  refresh();
  const timer=setInterval(refresh,15000);
  window.addEventListener('focus',refresh);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh)};
 },[]);
 const date=(value:string)=>new Date(value+'T12:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
 return <section className="pending-meetings" aria-labelledby="pending-title">
  <div className="pending-heading"><div><h1 id="pending-title">Pending meetings</h1></div><button className="outline" onClick={onCreate}>New meeting <ArrowRight size={14}/></button></div>
  {loading?<p role="status" className="pending-empty">Loading pending meetings…</p>:error?<p role="alert" className="pending-empty">{error}</p>:meetings.length===0?<div className="pending-empty"><CalendarDays size={28}/><h2>No pending meetings yet</h2><p>Create a meeting or join one through an invitation link to see it here.</p><button className="outline" onClick={onCreate}>Create a meeting <ArrowRight size={14}/></button></div>:<div className="pending-list">{meetings.map(({id,constraints:c,isPlanner,plannerName,attendees,canRejoin})=><article className="pending-card" key={id}><div className="pending-card-top"><span className="small-tag">{isPlanner?'PLANNER':'ATTENDEE'}</span></div><h2>{c.title||'Untitled meeting'}</h2><div className="meta"><span><CalendarDays size={14}/>Possible dates: {date(c.start)}{c.start!==c.end&&` – ${date(c.end)}`}</span><span><Clock3 size={14}/>{c.duration} min · {c.from}–{c.to} · {c.zone.replaceAll('_',' ')}</span><span><Users size={14}/>Planner: {plannerName||(isPlanner?'You':'Name not available yet')}</span><span><Users size={14}/>Attendees: {attendees.length?attendees.map(person=>person.name).join(', '):'No one has joined yet'}</span></div><a className="pending-open" href={`/?meeting=${encodeURIComponent(id)}`}>{canRejoin?'Rejoin meeting':'View shared availability'} <ArrowRight size={14}/></a><DeleteMeetingButton scope="personal" id={id} title={c.title} onDeleted={()=>{deleted.current.add(id);setMeetings(current=>current.filter(m=>m.id!==id))}}/>{isPlanner&&<DeleteMeetingButton id={id} title={c.title} onDeleted={()=>{deleted.current.add(id);setMeetings(current=>current.filter(m=>m.id!==id))}}/>}</article>)}</div>}
 </section>;
}
