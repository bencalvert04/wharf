'use client';
import {useEffect,useRef,useState} from 'react';
import {CalendarDays,ChevronDown,ChevronLeft,ChevronRight} from 'lucide-react';
import {meetingDateShortcuts} from '@/lib/date-shortcuts';
const parse=(value:string)=>new Date(value+'T12:00:00Z');
const iso=(value:Date)=>value.toISOString().slice(0,10);
const label=(value:string)=>parse(value).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
export default function DatePicker({start,end,onChange,shortcutZone}:{start:string;end:string;onChange:(start:string,end:string)=>void;shortcutZone?:string}){
 const [shortcuts,setShortcuts]=useState<ReturnType<typeof meetingDateShortcuts>|null>(null);
 useEffect(()=>{const refresh=()=>setShortcuts(meetingDateShortcuts(shortcutZone||Intl.DateTimeFormat().resolvedOptions().timeZone));refresh();window.addEventListener('focus',refresh);const timer=setInterval(refresh,60000);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}},[shortcutZone]);
 const [open,setOpen]=useState(false),[month,setMonth]=useState(start.slice(0,7)),[draft,setDraft]=useState<string|null>(null),[hover,setHover]=useState<string|null>(null);
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)){if(draft)onChange(draft,draft);setDraft(null);setOpen(false)}};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)},[open,draft,onChange]);
 const singleDay=start===end;
 const first=parse(month+'-01'),offset=(first.getUTCDay()+6)%7,numberOfDays=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 const rangeStart=draft?(hover&&hover<draft?hover:draft):start,rangeEnd=draft?(hover&&hover>draft?hover:draft):end;
 function shift(amount:number){setMonth(iso(new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+amount,1))).slice(0,7));setHover(null)}
 function close(){setDraft(null);setOpen(false);trigger.current?.focus()}
 function select(day:string){if(!draft){setDraft(day);setHover(null);return}onChange(day<draft?day:draft,day<draft?draft:day);close()}
 function quickDate(kind:'tomorrow'|'this-week'|'week'){const fresh=meetingDateShortcuts(shortcutZone!);setShortcuts(fresh);onChange(kind==='tomorrow'?fresh.tomorrow:kind==='this-week'?fresh.thisWeekStart:fresh.nextWeekStart,kind==='tomorrow'?fresh.tomorrow:kind==='this-week'?fresh.thisWeekEnd:fresh.nextWeekEnd);setDraft(null);setHover(null);setOpen(false)}
 return <div className={'date-picker'+(singleDay?' is-single':'')} ref={root} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();close()}}}>
 {shortcutZone&&<div className="date-shortcuts" role="group" aria-label="Quick date choices">
 <button type="button" aria-pressed={!!shortcuts&&start===shortcuts.tomorrow&&end===shortcuts.tomorrow} onClick={()=>quickDate('tomorrow')}>Tomorrow</button>
 <button type="button" title="Monday through Friday of the current week" aria-pressed={!!shortcuts&&start===shortcuts.thisWeekStart&&end===shortcuts.thisWeekEnd} onClick={()=>quickDate('this-week')}>This work week</button>
 <button type="button" title="Next Monday through Friday" aria-pressed={!!shortcuts&&start===shortcuts.nextWeekStart&&end===shortcuts.nextWeekEnd} onClick={()=>quickDate('week')}>Next week</button>
 <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setMonth(start.slice(0,7));setDraft(null);setHover(null);setOpen(true)}}>Choose dates</button>
 </div>}
 <button ref={trigger} id="meeting-dates" type="button" className="date-trigger" aria-haspopup="dialog" aria-expanded={open} aria-label={singleDay?`Date: ${label(start)}`:`Date range: ${label(start)} to ${label(end)}`} onClick={()=>{if(open){if(draft)onChange(draft,draft);close()}else{setMonth(start.slice(0,7));setDraft(null);setHover(null);setOpen(true)}}}><CalendarDays size={15}/><span>{label(start)}{!singleDay&&<> <span className="date-separator">→</span> {label(end)}</>}</span><ChevronDown size={14}/></button>
 {open&&<div className="date-popover" role="dialog" aria-label="Choose dates">
 <div className="date-month"><button type="button" className="icon-button" aria-label="Previous month" onClick={()=>shift(-1)}><ChevronLeft size={17}/></button><strong>{first.toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'})}</strong><button type="button" className="icon-button" aria-label="Next month" onClick={()=>shift(1)}><ChevronRight size={17}/></button></div>
 <p className="date-instruction" aria-live="polite" style={{visibility:draft?'hidden':'visible'}}>Choose a date or date range</p>
 <div className="date-weekdays" aria-hidden="true">{['M','T','W','T','F','S','S'].map((day,index)=><span key={index}>{day}</span>)}</div>
 <div className="date-days" onMouseLeave={()=>setHover(null)}>{Array.from({length:offset},(_,index)=><span key={'blank'+index}/>)}{Array.from({length:numberOfDays},(_,index)=>{const day=month+'-'+String(index+1).padStart(2,'0');const disabled=!!draft&&Math.abs(parse(day).getTime()-parse(draft).getTime())>30*86400000;const edge=day===rangeStart||day===rangeEnd;const inside=day>rangeStart&&day<rangeEnd;return <button type="button" key={day} disabled={disabled} aria-label={label(day)} aria-current={day===shortcuts?.today?'date':undefined} aria-pressed={edge||inside} className={'date-day'+(day===shortcuts?.today?' is-today':'')+(edge?' endpoint':'')+(inside?' in-range':'')} onMouseEnter={()=>!disabled&&setHover(day)} onFocus={()=>!disabled&&setHover(day)} onClick={()=>select(day)}>{index+1}</button>})}</div>
 <div className="date-picker-footer"><span>{draft?'Single day · '+label(draft):singleDay?'Single day':'Up to 31 days'}</span><button type="button" className="text-button" onClick={close}>Cancel</button></div>
 </div>}
 </div>
}
