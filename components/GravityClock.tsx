'use client';
import {useEffect,useRef} from 'react';

// The hand is a frictionless pendulum pivoting at the centre with just enough
// energy to clear twelve o’clock: it falls, whips through six, and creeps over the top.
const LAP=5600; // ms per revolution
const CREST=0.16; // angular speed at twelve, relative to gravity; smaller hangs longer at the top
const STEPS=1440;
const GHOSTS=[20,40,60,80,100,120];

let lap:Float64Array|null=null;
function timing(){
 if(lap)return lap;
 // Energy is conserved: ω²/2 + cos θ = CREST²/2 + 1, so dt = dθ / ω.
 const t=new Float64Array(STEPS+1),energy=CREST*CREST/2+1,step=2*Math.PI/STEPS;
 for(let i=1;i<=STEPS;i++)t[i]=t[i-1]+step/Math.sqrt(2*(energy-Math.cos((i-.5)*step)));
 for(let i=1;i<=STEPS;i++)t[i]/=t[STEPS];
 return lap=t;
}
function angleAt(ms:number){
 const t=timing(),f=(ms%LAP+LAP)%LAP/LAP;
 let lo=0,hi=STEPS;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(t[mid]<=f)lo=mid;else hi=mid}
 return (lo+(f-t[lo])/(t[hi]-t[lo]))/STEPS*360;
}

export default function GravityClock({className}:{className?:string}){
 const root=useRef<SVGSVGElement>(null),hand=useRef<SVGGElement>(null),ghosts=useRef<(SVGGElement|null)[]>([]);
 useEffect(()=>{
  const svg=root.current;if(!svg)return;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame=0,visible=true,origin=0,paused=0;
  const draw=(ms:number)=>{
   hand.current?.setAttribute('transform',`rotate(${angleAt(ms)} 100 100)`);
   GHOSTS.forEach((lag,i)=>ghosts.current[i]?.setAttribute('transform',`rotate(${angleAt(ms-lag)} 100 100)`));
  };
  const tick=(now:number)=>{draw(now-origin);frame=requestAnimationFrame(tick)};
  const stop=()=>{if(frame){cancelAnimationFrame(frame);frame=0;paused=performance.now()}};
  const start=()=>{if(frame||!visible||motion.matches)return;origin+=performance.now()-paused;frame=requestAnimationFrame(tick)};
  const sync=()=>{if(motion.matches){stop();origin=paused=performance.now();draw(0);svg.dataset.still='true'}else{delete svg.dataset.still;start()}};
  origin=paused=performance.now();
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)start();else stop()});
  observer.observe(svg);
  draw(0);sync();
  motion.addEventListener('change',sync);
  return()=>{stop();observer.disconnect();motion.removeEventListener('change',sync)};
 },[]);
 return <svg ref={root} className={'gravity-clock'+(className?' '+className:'')} viewBox="0 0 200 200" role="img" aria-label="Clock">
  <defs><radialGradient id="clock-face" cx="50%" cy="35%" r="70%"><stop offset="0" style={{stopColor:"var(--bg)"}}/><stop offset="1" style={{stopColor:"var(--subtle)"}}/></radialGradient></defs>
  <circle className="clock-rim" cx="100" cy="100" r="99"/>
  <circle className="clock-face" cx="100" cy="100" r="94" fill="url(#clock-face)"/>
  {Array.from({length:60},(_,i)=><line key={i} className={'clock-tick'+(i%15===0?' major':i%5===0?' hour':'')} x1="100" y1={i%15===0?12:i%5===0?13:14} x2="100" y2={i%5===0?24:18} transform={`rotate(${i*6} 100 100)`}/>)}
  {GHOSTS.map((_,i)=><g key={i} ref={el=>{ghosts.current[i]=el}} className="clock-ghost" style={{opacity:.2-i*.03}}><line x1="100" y1="100" x2="100" y2="44"/><circle cx="100" cy="40" r="9"/></g>)}
  <g ref={hand} className="clock-hand"><line x1="100" y1="118" x2="100" y2="44"/><circle cx="100" cy="40" r="10"/></g>
  <circle className="clock-pivot" cx="100" cy="100" r="5"/>
 </svg>;
}
