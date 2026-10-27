'use client';
import {useEffect,useRef} from 'react';

const CELL=56;
const THRESHOLD=.002;
type Cell={column:number;row:number;value:number};

/** Decorative hover shading aligned with the hero's existing CSS grid. */
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
  let frame=0,last=0,width=0,height=0,originX=0,ink='',opacity=.085;
  let bounds=surface.getBoundingClientRect();
  let clientX=0,clientY=0,hasPointer=false,active=false;
  let x=0,y=0,targetX=0,targetY=0;
  const enabled=()=>!motion.matches&&pointer.matches&&!document.hidden;
  function paint(){
   context!.clearRect(0,0,width,height);
   context!.fillStyle=ink;
   for(const cell of cells.values()){
    context!.globalAlpha=cell.value*opacity;
    context!.fillRect(originX+cell.column*CELL+1,cell.row*CELL,CELL-1,CELL-1);
   }
   context!.globalAlpha=1;
  }
  function tick(now:number){
   frame=0;
   const elapsed=Math.min(now-last||16,40);last=now;
   const follow=1-Math.exp(-elapsed/45);
   x+=(targetX-x)*follow;y+=(targetY-y)*follow;
   const desired=new Map<string,number>();
   if(active&&enabled()){
    const column=Math.floor((x-originX)/CELL),row=Math.floor((y+1)/CELL);
    // A stronger hovered square with softly fading neighboring squares.
    for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++){
     const c=column+dx,r=row+dy;
     const centerX=originX+c*CELL+CELL/2,centerY=r*CELL+CELL/2-1;
     const distance=Math.hypot(centerX-x,centerY-y);
     if(distance>110)continue;
     const key=`${c}:${r}`;
     desired.set(key,c===column&&r===row?1:.52*Math.exp(-distance*distance/(2*58*58)));
     if(!cells.has(key))cells.set(key,{column:c,row:r,value:0});
    }
   }
   let unsettled=active&&(Math.abs(x-targetX)+Math.abs(y-targetY)>.1);
   for(const [key,cell] of cells){
    const goal=desired.get(key)||0;
    cell.value+=(goal-cell.value)*(1-Math.exp(-elapsed/(goal>cell.value?80:370)));
    if(Math.abs(cell.value-goal)>THRESHOLD)unsettled=true;
    else cell.value=goal;
    if(!goal&&cell.value<THRESHOLD)cells.delete(key);
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
   opacity=app?.classList.contains('light') ? 0.105 : 0.15;
   paint();
  }
  function resize(){
   bounds=surface.getBoundingClientRect();width=bounds.width;height=bounds.height;
   // background-position:center -1px with a 56px image puts the first line here.
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
  return()=>{
   cancelAnimationFrame(frame);resizeObserver.disconnect();themeObserver.disconnect();
   window.removeEventListener('pointermove',move);window.removeEventListener('pointerout',outside);
   window.removeEventListener('blur',leave);window.removeEventListener('scroll',scroll);
   document.removeEventListener('visibilitychange',stop);
   motion.removeEventListener('change',preference);pointer.removeEventListener('change',preference);
  };
 },[]);
 return <div className="hero-grid-hover" aria-hidden="true"><canvas ref={ref}/></div>;
}
