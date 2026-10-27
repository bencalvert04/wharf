'use client';
import {useEffect,useState,useRef,type CSSProperties,type RefObject} from 'react';
import AnchorMark from './AnchorMark';

const sessionKey='wharf-anchor-welcome';

export default function AnchorEntrance({target}:{target:RefObject<SVGSVGElement|null>}) {
 const started=useRef(false);
 const [flight,setFlight]=useState<CSSProperties|null>(null);
 useEffect(()=>{
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  // Skip the flourish on Google callbacks, where the next task is already underway.
  if(motion.matches||new URLSearchParams(location.search).has('calendar'))return;
  try{if(sessionStorage.getItem(sessionKey)&&!started.current)return;sessionStorage.setItem(sessionKey,'seen')}catch{}
  started.current=true;
  const logo=target.current?.getBoundingClientRect();
  if(!logo||!logo.width)return;
  setFlight({left:logo.left,top:logo.top,width:logo.width,height:logo.height,'--anchor-x':`${window.innerWidth/2-logo.left-logo.width/2}px`,'--anchor-y':`${Math.min(window.innerHeight*.34,280)-logo.top-logo.height/2}px`} as CSSProperties);
  const finish=()=>setFlight(null);
  // Also remove it if CSS animation events are interrupted or unsupported.
  const timeout=window.setTimeout(finish,1500);
  motion.addEventListener('change',finish);
  window.addEventListener('resize',finish);
  window.addEventListener('scroll',finish,{passive:true});
  return()=>{window.clearTimeout(timeout);motion.removeEventListener('change',finish);window.removeEventListener('resize',finish);window.removeEventListener('scroll',finish)};
 },[target]);
 if(!flight)return null;
 return <div className="anchor-entrance" style={flight} aria-hidden="true" onAnimationEnd={event=>{if(event.target===event.currentTarget)setFlight(null)}}><AnchorMark className="entrance-mark"/></div>;
}
