import {Space_Grotesk} from 'next/font/google';

const wordmarkFont=Space_Grotesk({subsets:['latin'],weight:'400',display:'swap'});

export default function HomeWordmark(){
 return <h1 id="hero-title" className={`home-wordmark ${wordmarkFont.className}`}>WHARF</h1>;
}
