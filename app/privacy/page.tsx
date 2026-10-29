import {privacyPolicy} from '@/lib/privacy-policy';
export default function Privacy(){
 return <main style={{maxWidth:720,margin:'60px auto',padding:24,lineHeight:1.8}}>
  <a href="/">← Wharf</a><h1>Privacy</h1>
  {Object.entries(privacyPolicy).map(([key,text])=><p key={key}>{text}</p>)}
 </main>;
}
