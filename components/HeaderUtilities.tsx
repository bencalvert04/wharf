'use client';
import {useEffect,useRef,useState} from 'react';
import {MoreHorizontal,ArrowUpRight} from 'lucide-react';
import PlatformMenu from './PlatformMenu';
export default function HeaderUtilities({onDocs,active}:{onDocs:()=>void;active:boolean}){
 const [open,setOpen]=useState(false);const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus()}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}},[open]);
 return <div className="header-tools" ref={root}><button ref={trigger} className="icon-button mobile-tools-toggle" aria-label="More Wharf options" aria-expanded={open} aria-controls="header-tools-panel" onClick={()=>setOpen(!open)}><MoreHorizontal size={20}/></button><div id="header-tools-panel" className={'header-tools-panel'+(open?' is-open':'')}><PlatformMenu/><button aria-current={active?'page':undefined} onClick={()=>{setOpen(false);onDocs()}}>API <ArrowUpRight size={12}/></button></div></div>;
}
