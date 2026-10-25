'use client';
import {useEffect,useState,type CSSProperties,type MouseEvent} from 'react';
import type {Window} from '@/lib/availability';
import {meetingSlot} from '@/lib/meeting-slot';
const time=(value:number,zone:string)=>new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit'}).format(value);
export default function AvailabilityWindow({window:w,duration,zone,style,selected,onSelect}:{window:Window;duration:number;zone:string;style:CSSProperties;selected:Window|null;onSelect:(slot:Window)=>void}){
 const [preview,setPreview]=useState<Window|null>(null);
 const pinned=selected&&selected.date===w.date&&selected.start>=w.start&&selected.end<=w.end&&selected.people.join('\0')===w.people.join('\0')?selected:null;
 useEffect(()=>{setPreview(null)},[selected]);
 const slot=selected?pinned:preview;
 const range=(value:Window)=>`${time(value.start,zone)} – ${time(value.end,zone)}`;
 function atPointer(event:MouseEvent<HTMLButtonElement>){const rect=event.currentTarget.getBoundingClientRect();return meetingSlot(w,duration,(event.clientY-rect.top)/rect.height)}
 return <button data-meeting-slot="true" type="button" className={'window slot-window'+(slot?' has-slot':'')+(pinned?' selected':'')} style={style} aria-label={`${range(w)} available. ${duration} minute meeting. Use up and down arrows to choose a start time, then Enter to select.`} onMouseMove={event=>{if(!selected)setPreview(atPointer(event))}} onMouseLeave={()=>setPreview(null)} onFocus={()=>{if(!selected)setPreview(meetingSlot(w,duration,0))}} onBlur={()=>setPreview(null)} onKeyDown={event=>{if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();if(selected)return;const current=preview||pinned||meetingSlot(w,duration,0);const position=event.key==='Home'?0:event.key==='End'?1:(current.start-w.start+(event.key==='ArrowDown'?900000:-900000))/(w.end-w.start);setPreview(meetingSlot(w,duration,position))}if(event.key==='Escape'){setPreview(null);event.currentTarget.blur()}}} onClick={event=>{const chosen=event.detail===0?(preview||pinned||meetingSlot(w,duration,0)):atPointer(event);setPreview(null);onSelect(chosen)}}>
 <span className="availability-label"><span>{time(w.start,zone)}</span><small>{Math.round((w.end-w.start)/60000)} min</small></span>
 {slot&&<span className="meeting-slot" style={{top:(slot.start-w.start)/(w.end-w.start)*100+'%',height:(slot.end-slot.start)/(w.end-w.start)*100+'%'}}><span>{range(slot)}</span><small>{Math.round((slot.end-slot.start)/60000)} min{slot.end-slot.start<duration*60000?' · shorter option':''}</small></span>}
 </button>
}
