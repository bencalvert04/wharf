'use client';

import {useEffect, useState, type ReactNode} from 'react';

export default function HeroEntrance({children}: {children: ReactNode}) {
 const [iteration, setIteration] = useState(0);
 const [preview, setPreview] = useState(false);
 const [ready, setReady] = useState(false);
 useEffect(() => {
  setPreview(process.env.NODE_ENV === 'development' && new URLSearchParams(location.search).get('preview') === 'entrance');
 }, []);
 useEffect(() => {
  let cancelled = false, resourcesReady = false, started = false;
  let firstFrame = 0, secondFrame = 0;
  const page = document as Document & {prerendering?: boolean};
  const cancelFrames = () => {
   cancelAnimationFrame(firstFrame);
   cancelAnimationFrame(secondFrame);
   firstFrame = secondFrame = 0;
  };
  const startWhenVisible = () => {
   if (cancelled || started) return;
   if (document.visibilityState !== 'visible' || page.prerendering) {
    cancelFrames();
    return;
   }
   if (!resourcesReady || firstFrame || secondFrame) return;
   // Give the activated page a paint before starting its entrance timeline.
   firstFrame = requestAnimationFrame(() => {
    firstFrame = 0;
    secondFrame = requestAnimationFrame(() => {
     secondFrame = 0;
     if (cancelled || document.visibilityState !== 'visible' || page.prerendering) return;
     started = true;
     setReady(true);
    });
   });
  };
  let removeLoad = () => {};
  const loaded = new Promise<void>(resolve => {
   if (document.readyState === 'complete') resolve();
   else window.addEventListener('load', onLoad, {once: true});
   function onLoad() {resolve()}
   removeLoad = () => window.removeEventListener('load', onLoad);
  });
  // A stalled font or asset must not leave the page waiting indefinitely.
  let timeout: ReturnType<typeof setTimeout>;
  const deadline = new Promise<void>(resolve => {timeout = setTimeout(resolve, 1500)});
  Promise.race([Promise.all([loaded, document.fonts.ready]), deadline]).then(() => {
   clearTimeout(timeout);
   if (cancelled) return;
   resourcesReady = true;
   startWhenVisible();
  });
  document.addEventListener('visibilitychange', startWhenVisible);
  document.addEventListener('prerenderingchange', startWhenVisible);
  window.addEventListener('pageshow', startWhenVisible);
  return () => {
   cancelled = true;
   clearTimeout(timeout);
   cancelFrames();
   removeLoad();
   document.removeEventListener('visibilitychange', startWhenVisible);
   document.removeEventListener('prerenderingchange', startWhenVisible);
   window.removeEventListener('pageshow', startWhenVisible);
  };
 }, [iteration]);
 return <>
  <noscript><style>{'.hero-entrance,.hero-entrance *,.hero-entrance::before,.hero-entrance *::before,.hero-entrance *::after{animation:none!important}'}</style></noscript>
  <section key={iteration} className="hero hero-entrance" data-entrance-ready={ready} aria-labelledby="hero-title">
   {children}
  </section>
  {preview && <div className="entrance-preview-controls">
   <button type="button" onClick={() => {setReady(false); setIteration(value => value + 1)}}>Replay entrance</button>
  </div>}
 </>;
}
