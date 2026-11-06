'use client';
import {useEffect,useId,useRef,useState,type CSSProperties,type MouseEvent} from 'react';
import {createPortal} from 'react-dom';
import type {Window} from '@/lib/availability';
import {meetingSlot} from '@/lib/meeting-slot';
const time=(value:number,zone:string)=>new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit'}).format(value);
export default function AvailabilityWindow({window:w,bestMatch,duration,zone,style,selected,onSelect,onPreview}:{window:Window;bestMatch?:boolean;duration:number;zone:string;style:CSSProperties;selected:Window|null;onSelect:(slot:Window)=>void;onPreview?:(slot:Window|null)=>void}){
 const [preview,setPreview]=useState<Window|null>(null);
 const button=useRef<HTMLButtonElement>(null);
 const tooltipId=useId();
 const [anchor,setAnchor]=useState<{left:number;top:number;above:boolean}|null>(null);
 const pinned=selected&&selected.date===w.date&&selected.start>=w.start&&selected.end<=w.end&&selected.people.join('\0')===w.people.join('\0')?selected:null;
 useEffect(()=>{setPreview(null);setAnchor(null)},[selected]);
 useEffect(()=>{
  if(!anchor)return;
  const clear=()=>{setPreview(null);setAnchor(null);onPreview?.(null)};
  window.addEventListener('scroll',clear,true);
  window.addEventListener('resize',clear);
  return ()=>{window.removeEventListener('scroll',clear,true);window.removeEventListener('resize',clear)};
 },[anchor,onPreview]);
 const slot=selected&&!w.conflicts?.length?pinned:preview||pinned;
 const partial=!!w.conflicts?.length;
 const count=partial?`${w.people.length} of ${w.people.length+w.conflicts!.length}`:'';
 const lastOffset=Math.floor(Math.max(0,w.end-w.start-duration*60000)/900000)*900000;
 const bandLength=lastOffset+900000;
 const startLabel=time(w.start,zone)+(lastOffset?` through ${time(w.start+lastOffset,zone)}`:'');
 const shading=partial?{...style,'--attendance-shade':`${8+35*w.people.length/(w.people.length+w.conflicts!.length)}%`}:style;
 const compactRange=(value:Window)=>new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',minute:'2-digit'}).formatRange(value.start,value.end);
 const range=(value:Window)=>`${time(value.start,zone)} – ${time(value.end,zone)}`;
 function updatePreview(next:Window|null){
  if(next?.start===preview?.start&&next?.end===preview?.end)return;
  setPreview(next);
  if(!partial)return;
  onPreview?.(next);
  if(!next){setAnchor(null);return}
  if(!button.current||anchor)return;
  const rect=button.current.getBoundingClientRect();
  const above=rect.top>window.innerHeight/2;
  setAnchor({left:Math.max(8,Math.min(rect.left,window.innerWidth-256)),top:above?rect.top-6:rect.bottom+6,above});
 }
 function atPointer(event:MouseEvent<HTMLButtonElement>){const rect=event.currentTarget.getBoundingClientRect();return meetingSlot(w,duration,(event.clientY-rect.top)/rect.height)}
 return <><button ref={button} aria-describedby={partial&&preview&&anchor?tooltipId:undefined} data-meeting-slot="true" type="button" className={'window slot-window'+(slot&&!partial?' has-slot':'')+(pinned?' selected':'')+(partial?' partial-window':'')+(partial&&bestMatch?' best-match':'')} style={shading} aria-label={`${partial?`Starts ${startLabel}. ${count} available`:`${range(w)} available`}. ${duration} minute meeting. Use up and down arrows to choose a start time, then Enter to select.`} onPointerMove={event=>{
  if(event.pointerType==='mouse'&&(!selected||partial))updatePreview(atPointer(event));
 }} onPointerLeave={()=>updatePreview(null)} onFocus={()=>{
  if(!selected||partial)updatePreview(meetingSlot(w,duration,0));
 }} onBlur={()=>updatePreview(null)} onKeyDown={event=>{
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();
   if(selected&&!partial)return;
   const current=preview||pinned||meetingSlot(w,duration,0);
   const offset=event.key==='ArrowDown'?900000:-900000;
   const position=event.key==='Home'?0:event.key==='End'?1:(current.start-w.start+offset)/(partial?bandLength:w.end-w.start);
   updatePreview(meetingSlot(w,duration,position));
  }
  if(event.key==='Escape'){updatePreview(null);event.currentTarget.blur()}
 }} onClick={event=>{
  const chosen=event.detail===0?(preview||pinned||meetingSlot(w,duration,0)):atPointer(event);
  updatePreview(null);
  onSelect(chosen);
 }}>
 {!partial&&<span className="availability-label"><span>{time(w.start,zone)}</span><small>{Math.round((w.end-w.start)/60000)} min</small></span>}
 {slot&&partial&&<span className="alternative-start-marker" aria-hidden="true" style={{top:(slot.start-w.start)/bandLength*100+'%',height:900000/bandLength*100+'%'}}/>}
 {slot&&!partial&&<span className="meeting-slot" title={`${range(slot)} · ${Math.round((slot.end-slot.start)/60000)} minutes`} style={{top:(slot.start-w.start)/(w.end-w.start)*100+'%',height:(slot.end-slot.start)/(w.end-w.start)*100+'%'}}><span>{compactRange(slot)}</span></span>}
 </button>
 {partial&&preview&&anchor&&createPortal(
  <div id={tooltipId} role="tooltip" className="alternative-hover-card" style={{left:anchor.left,top:anchor.top,transform:anchor.above?'translateY(-100%)':undefined}}>
   <strong>{range(preview)}</strong>
   <span>{count} available</span>
   <span><b>Can’t attend:</b> {preview.conflicts!.join(', ')}</span>
  </div>,document.body)}
 </>
}
