'use client';

import {useLayoutEffect,useRef,type ReactNode} from 'react';
import styles from '@/app/slack/slack.module.css';

/** One coordinated entrance, measured from the actual responsive layout. */
export default function SlackEntrance({children}:{children:ReactNode}){
 const ref=useRef<HTMLElement>(null);
 useLayoutEffect(()=>{
  const root=ref.current!;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const copy=root.querySelector<HTMLElement>('[data-hero-copy]')!;
  const window=root.querySelector<HTMLElement>(`.${styles.slack}`)!;
  const animations:Animation[]=[];
  const finish=()=>{animations.forEach(a=>a.cancel());root.dataset.entrance='done'};
  if(motion.matches){finish();return}
  const lift=window.getBoundingClientRect().top-copy.getBoundingClientRect().top;
  const animate=(element:Element,frames:Keyframe[],delay:number,duration:number)=>{
   const animation=element.animate(frames,{duration,delay,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
   animations.push(animation);return animation;
  };
  // The window is the opening image; its fall uncovers the rising copy.
  animate(window,[{transform:`translateY(${-lift}px) scale(.975)`,opacity:0},{transform:`translateY(${-lift}px) scale(.975)`,opacity:1,offset:.12},{transform:'translateY(7px) scale(1)',opacity:1,offset:.83},{transform:'translateY(0) scale(1)',opacity:1}],100,1550);
  Array.from(copy.children).forEach((element,index)=>{
   animate(element,[{transform:'translateY(110px)',opacity:0,filter:'blur(5px)'},{transform:'translateY(0)',opacity:1,filter:'blur(0)'}],380+index*75,950);
  });
  root.querySelectorAll(`.${styles.tryRow}, .${styles.demoNote}`).forEach((element,index)=>{
   animate(element,[{transform:'translateY(-72px)',opacity:0},{transform:'translateY(0)',opacity:1}],970+index*100,850);
  });
  root.querySelectorAll(`:scope > .${styles.section}, :scope > .${styles.closing}`).forEach((element,index)=>{
   animate(element,[{transform:'translateY(-90px)',opacity:0},{transform:'translateY(0)',opacity:1}],1080+index*80,950);
  });
  root.dataset.entrance='running';
  // Keyboard navigation never waits for decorative movement.
  root.addEventListener('focusin',finish,{once:true});
  motion.addEventListener('change',finish);
  return ()=>{finish();root.removeEventListener('focusin',finish);motion.removeEventListener('change',finish)};
 },[]);
 return <main ref={ref} className={styles.page} data-entrance="pending">{children}</main>;
}
