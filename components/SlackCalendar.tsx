'use client';
import {useEffect,useState} from 'react';
import AvailabilityWindow from '@/components/AvailabilityWindow';
import {dates,localParts,type Window} from '@/lib/availability';
import {calendarDisplayRange,calendarTickLabel} from '@/lib/calendar-display';
import '@/app/globals.css';
import '@/app/slack/calendar/embed.css';
export default function SlackCalendar(){
 const [access,setAccess]=useState(''),[data,setData]=useState<any>(null),[error,setError]=useState(''),[day,setDay]=useState(''),[selected,setSelected]=useState<Window|null>(null),[busy,setBusy]=useState(false),[permission,setPermission]=useState(false);
 const time=(n:number)=>new Intl.DateTimeFormat('en-US',{timeZone:data.constraints.zone,hour:'numeric',minute:'2-digit'}).format(n);
 async function load(token:string){const r=await fetch('/api/slack/calendar',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setData(d);setDay(old=>old||d.constraints.start);return d}
 useEffect(()=>{const token=new URLSearchParams(location.hash.slice(1)).get('access')||'';setAccess(token);load(token).catch(e=>setError(e.message))},[]);
 async function refresh(){setBusy(true);setError('');setSelected(null);try{await load(access)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function book(){if(!selected)return;setBusy(true);setError('');try{const r=await fetch('/api/slack/calendar',{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({start:selected.start,end:selected.end,revision:data.revision})});const d=await r.json();if(!r.ok){setPermission(!!d.permission);throw Error(d.error)}await load(access);setSelected(null)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const c=data?.constraints,range=c?calendarDisplayRange(c,[day]):null;
 return <div className="app wharf-embed"><header><span className="brand">Wharf</span><span className="eyebrow">CHOOSE A TIME</span></header><main>
 {!data?<p role="status">{error||'Loading shared availability…'}</p>:<><h1>{c.title}</h1><p className="embed-meta">{c.duration} minutes · {c.zone}</p><p className="micro">{data.attendees.length} calendars connected{data.waiting?` · Waiting for ${data.waiting} more`:''}. Only you, the requester, can book.</p>
 {data.finalTime?<div className="selection"><strong>{data.calendar?.status==='created'?'Meeting booked':'Booking pending'}</strong><p>{time(new Date(data.finalTime.start).getTime())} – {time(new Date(data.finalTime.end).getTime())}</p><a href={`/?meeting=${data.id}`} target="_blank" rel="noreferrer">View meeting details</a></div>:<>
 <div className="embed-tools"><label>Day<select aria-label="Meeting day" value={day} onChange={e=>{setDay(e.target.value);setSelected(null)}}>{dates(c).map(d=><option key={d} value={d}>{new Date(d+'T12:00Z').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'})}</option>)}</select></label><button className="outline" disabled={busy} onClick={refresh}>Refresh</button></div>
 <div className="embed-grid"><div className="embed-axis">{range!.ticks.map(t=><span key={t} style={{top:(t-range!.startMinute)/(range!.endMinute-range!.startMinute)*100+'%'}}>{calendarTickLabel(t)}</span>)}</div><div className="embed-day">{range!.ticks.map(t=><div className="hour-line" key={t} style={{top:(t-range!.startMinute)/(range!.endMinute-range!.startMinute)*100+'%'}}/>)}{data.windows.filter((w:Window)=>w.date===day).map((w:Window)=>{const p=localParts(w.start,c.zone).time;const start=Number(p.slice(0,2))*60+Number(p.slice(3));return <AvailabilityWindow key={w.start} window={w} duration={c.duration} zone={c.zone} selected={selected} onSelect={setSelected} style={{top:(start-range!.startMinute)/(range!.endMinute-range!.startMinute)*100+'%',height:(w.end-w.start)/60000/(range!.endMinute-range!.startMinute)*100+'%'}}/>})}</div></div>
 {!data.windows.some((w:Window)=>w.date===day)&&<p className="micro">No shared availability on this day.</p>}
 <div className="embed-selection" aria-live="polite">{selected?<><strong>{time(selected.start)} – {time(selected.end)}</strong><p className="micro">{data.waiting?'Waiting for everyone to connect their calendar.':'This time fits the connected calendars.'}</p><button className="primary full" disabled={busy||data.waiting>0||selected.end-selected.start!==c.duration*60000||selected.start<=Date.now()} onClick={book}>{busy?'Booking…':'Book meeting'}</button><button className="text-button" onClick={()=>setSelected(null)}>Choose another time</button></>:<p className="micro">Select a time in the calendar to review and book.</p>}</div></>}
 {error&&<p role="alert" className="embed-error">{error}</p>}{permission&&<a className="outline" target="_blank" rel="noreferrer" href={`/?meeting=${data.id}`}>Open Wharf to allow invitations</a>}
 <p className="micro">{data.attendees.join(' · ')}</p>
 </>}
 </main></div>;
}
