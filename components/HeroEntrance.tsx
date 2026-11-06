'use client';

import {useEffect, useState, type ReactNode} from 'react';

export default function HeroEntrance({children}: {children: ReactNode}) {
 const [iteration, setIteration] = useState(0);
 const [preview, setPreview] = useState(false);
 useEffect(() => {
  setPreview(process.env.NODE_ENV === 'development' && new URLSearchParams(location.search).get('preview') === 'entrance');
 }, []);
 return <>
  <section key={iteration} className="hero hero-entrance" aria-labelledby="hero-title">
   {children}
  </section>
  {preview && <div className="entrance-preview-controls">
   <button type="button" onClick={() => setIteration(value => value + 1)}>Replay entrance</button>
  </div>}
 </>;
}
