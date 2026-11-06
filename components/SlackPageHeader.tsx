'use client';
import Link from 'next/link';
import styles from '@/app/slack/slack.module.css';
import {useEffect,useState} from 'react';
import {ArrowUpRight,Sun,Moon,Monitor} from 'lucide-react';
import AccountButton from '@/components/AccountButton';

export default function SlackPageHeader(){
 const [theme,setTheme]=useState('light');
 useEffect(()=>{
  try{const saved=localStorage.getItem('wharf-theme');
  if(saved==='light'||saved==='dark'||saved==='system')setTheme(saved)}catch{}
 },[]);
 useEffect(()=>{
  const shell=document.querySelector('[data-slack-shell]');
  const system=matchMedia('(prefers-color-scheme: dark)');
  const apply=()=>{const dark=theme==='dark'||(theme==='system'&&system.matches);shell?.classList.toggle('dark',dark);shell?.classList.toggle('light',!dark)};
  apply();system.addEventListener('change',apply);return()=>system.removeEventListener('change',apply);
 },[theme]);
 return <header className={styles.pageHeader}>
  <div className="header-left"><Link href="/" className="brand" style={{color:'inherit',textDecoration:'none'}}><span className="brandmark" aria-hidden="true">⚓️</span>Wharf</Link>
   <nav aria-label="Main navigation"><Link href="/?view=new">Scheduler</Link><Link href="/?view=pending">Pending meetings</Link></nav>
  </div>
  <nav aria-label="Utilities"><Link href="/slack" className="slack-nav-link active" aria-current="page"><span className="slack-nav-full">Wharf for Slack</span><span className="slack-nav-short" aria-hidden="true">Slack</span> <ArrowUpRight size={12}/></Link><Link href="/?view=docs">API <ArrowUpRight size={12}/></Link><span className="nav-divider"/>
   <button className="icon-button" aria-label={`Appearance: ${theme}. Switch to ${theme==='light'?'dark':theme==='dark'?'system':'light'} mode`} onClick={()=>{const next=theme==='light'?'dark':theme==='dark'?'system':'light';setTheme(next);try{localStorage.setItem('wharf-theme',next)}catch{}}}>{theme==='light'?<Sun size={16}/>:theme==='dark'?<Moon size={16}/>:<Monitor size={16}/>}</button>
   <AccountButton navigationKey="slack"/>
  </nav>
 </header>;
}
