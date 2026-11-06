'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import styles from './PlatformMenu.module.css';
const platforms=['Slack','Discord','Teams'];
export default function PlatformMenu({current}:{current?:'Slack'|'Discord'}){
 const [open,setOpen]=useState(false),[index,setIndex]=useState(current==='Discord'?1:0);
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;const timer=setInterval(()=>setIndex(i=>(i+1)%3),2600);return()=>clearInterval(timer)},[]);
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[open]);
 return <div ref={root} className={styles.root} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);root.current?.querySelector('button')?.focus()}}}>
  <button type="button" className={styles.trigger} aria-expanded={open} aria-controls="wharf-platforms" onClick={()=>setOpen(!open)}><span className={styles.prefix}>Wharf for </span><span className={styles.word} aria-hidden="true"><span key={index}>{platforms[index]}</span></span><span className={styles.sr}>Slack, Discord and Teams</span><ChevronDown size={12}/></button>
  {open&&<div id="wharf-platforms" className={styles.menu}><Link href="/slack" aria-current={current==='Slack'?'page':undefined}>Slack <span>{current==='Slack'?'Current':'Open'}</span></Link><Link href="/discord" aria-current={current==='Discord'?'page':undefined}>Discord <span>{current==='Discord'?'Current':'Open'}</span></Link><button type="button" disabled>Teams <span>Coming soon</span></button></div>}
 </div>;
}
