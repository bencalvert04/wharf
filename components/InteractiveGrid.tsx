'use client';
import {useEffect,useRef} from 'react';

const CELL=32;
const THRESHOLD=.002;
type Cell={value:number;offsetX:number;offsetY:number};

/** Dots gently gather toward the pointer and turn blue, then settle back. */
export default function InteractiveGrid(){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=ref.current;
  if(!canvas)return;
  const context=canvas.getContext('2d');
  if(!context)return;
  const surface=canvas.parentElement!;
  const app=canvas.closest('.app');
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer=window.matchMedia('(hover: hover) and (pointer: fine)');
  const cells=new Map<string,Cell>();
  let frame=0,last=0,width=0,height=0,originX=0,ink='',baseInk='',opacity=.8;
  let bounds=surface.getBoundingClientRect();
  let clientX=0,clientY=0,hasPointer=false,active=false;
  let x=0,y=0,targetX=0,targetY=0;
  const enabled=()=>!motion.matches&&pointer.matches&&!document.hidden;
  function paint(){
   context!.clearRect(0,0,width,height);
   for(let column=-1;column*CELL<width;column++)for(let row=0;row*CELL<height;row++){
    const cell=cells.get(`${column}:${row}`);
    const value=cell?.value||0;
    const centerX=originX+column*CELL+CELL/2+(cell?.offsetX||0);
    const centerY=row*CELL+CELL/2-1+(cell?.offsetY||0);
    context!.beginPath();
    context!.arc(centerX,centerY,1+value*.65,0,Math.PI*2);
    context!.fillStyle=baseInk;
    context!.globalAlpha=.28*(1-value);
    context!.fill();
    if(value){context!.fillStyle=ink;context!.globalAlpha=value*opacity;context!.fill()}
   }
   context!.globalAlpha=1;
  }
  function tick(now:number){
   frame=0;
   const elapsed=Math.min(now-last||16,40);last=now;
   const follow=1-Math.exp(-elapsed/45);
   x+=(targetX-x)*follow;y+=(targetY-y)*follow;
   const desired=new Map<string,{value:number;offsetX:number;offsetY:number}>();
   if(active&&enabled()){
    const column=Math.floor((x-originX)/CELL),row=Math.floor((y+1)/CELL);
    for(let dx=-6;dx<=6;dx++)for(let dy=-6;dy<=6;dy++){
     const c=column+dx,r=row+dy;
     const centerX=originX+c*CELL+CELL/2,centerY=r*CELL+CELL/2-1;
     const distance=Math.hypot(centerX-x,centerY-y);
     if(distance>180)continue;
     const key=`${c}:${r}`;
     // Keep some spacing near the pointer rather than collapsing into one dot.
     const pull=distance*.8*(1-distance/180);
     const angle=distance>.01?Math.atan2(centerY-y,centerX-x):(c+r)*2.4;
     desired.set(key,{value:Math.exp(-distance*distance/(2*58*58)),offsetX:-Math.cos(angle)*pull,offsetY:-Math.sin(angle)*pull});
     if(!cells.has(key))cells.set(key,{value:0,offsetX:0,offsetY:0});
    }
   }
   let unsettled=active&&(Math.abs(x-targetX)+Math.abs(y-targetY)>.1);
   for(const [key,cell] of cells){
    const goal=desired.get(key);
    const value=goal?.value||0,offsetX=goal?.offsetX||0,offsetY=goal?.offsetY||0;
    cell.value+=(value-cell.value)*(1-Math.exp(-elapsed/(value>cell.value?130:400)));
    const settle=1-Math.exp(-elapsed/(goal?150:400));
    cell.offsetX+=(offsetX-cell.offsetX)*settle;
    cell.offsetY+=(offsetY-cell.offsetY)*settle;
    if(Math.abs(cell.value-value)>THRESHOLD||Math.abs(cell.offsetX-offsetX)+Math.abs(cell.offsetY-offsetY)>.03)unsettled=true;
    else {cell.value=value;cell.offsetX=offsetX;cell.offsetY=offsetY;if(!goal)cells.delete(key)}
   }
   paint();
   // No permanent animation loop when the cursor is still or off the page.
   if(unsettled)frame=requestAnimationFrame(tick);
  }
  function wake(){if(!frame&&enabled()&&(active||cells.size)){last=performance.now();frame=requestAnimationFrame(tick)}}
  function locate(){
   const nextX=clientX-bounds.left,nextY=clientY-bounds.top;
   active=hasPointer&&enabled()&&nextX>=0&&nextX<width&&nextY>=0&&nextY<height;
   if(active){targetX=nextX;targetY=nextY}
   wake();
  }
  function move(event:PointerEvent){
   if(event.pointerType==='touch'||!enabled())return;
   clientX=event.clientX;clientY=event.clientY;
   const wasActive=active;hasPointer=true;
   locate();
   if(!wasActive&&active){x=targetX;y=targetY}
  }
  function leave(){hasPointer=false;active=false;wake()}
  function stop(){
   cancelAnimationFrame(frame);frame=0;active=false;hasPointer=false;cells.clear();paint();
  }
  function appearance(){
   ink=getComputedStyle(canvas!).color;
   baseInk=getComputedStyle(canvas!).getPropertyValue('--muted').trim();
   opacity=app?.classList.contains('light') ? 0.8 : 0.9;
   paint();
  }
  function resize(){
   bounds=surface.getBoundingClientRect();width=bounds.width;height=bounds.height;
   // Match the centered 32px CSS tiles; dots sit at each tile center.
   originX=((width-CELL)/2)%CELL;
   const ratio=Math.min(window.devicePixelRatio||1,2);
   canvas!.width=Math.round(width*ratio);canvas!.height=Math.round(height*ratio);
   context!.setTransform(ratio,0,0,ratio,0,0);
   cells.clear();appearance();locate();
  }
  function scroll(){bounds=surface.getBoundingClientRect();locate()}
  function preference(){stop()}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(surface);
  const themeObserver=new MutationObserver(appearance);
  if(app)themeObserver.observe(app,{attributes:true,attributeFilter:['class']});
  window.addEventListener('pointermove',move,{passive:true});
  window.addEventListener('pointerout',outside);
  window.addEventListener('blur',leave);
  window.addEventListener('scroll',scroll,{passive:true});
  document.addEventListener('visibilitychange',stop);
  motion.addEventListener('change',preference);pointer.addEventListener('change',preference);
  function outside(event:PointerEvent){if(!event.relatedTarget)leave()}
  resize();
  surface.dataset.ready='true';
  return()=>{
   delete surface.dataset.ready;
   cancelAnimationFrame(frame);resizeObserver.disconnect();themeObserver.disconnect();
   window.removeEventListener('pointermove',move);window.removeEventListener('pointerout',outside);
   window.removeEventListener('blur',leave);window.removeEventListener('scroll',scroll);
   document.removeEventListener('visibilitychange',stop);
   motion.removeEventListener('change',preference);pointer.removeEventListener('change',preference);
  };
 },[]);
 return <div className="hero-grid-hover" aria-hidden="true"><canvas ref={ref}/></div>;
}
