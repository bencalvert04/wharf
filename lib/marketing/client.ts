'use client';
import {campaignTag,type MarketingEvent} from './events';
export function trackMarketing(event:MarketingEvent,view='other'){
 try{
  if(process.env.NEXT_PUBLIC_MARKETING_ENABLED!=='true'||navigator.doNotTrack==='1'||(navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl||localStorage.getItem('wharf-marketing-opt-out')==='true')return;
  const params=new URLSearchParams(location.search);
  if(params.has('preview')||params.get('view')==='demo')return;
  const now=Date.now(),key='wharf-marketing-visit';
  let visit=JSON.parse(sessionStorage.getItem(key)||'null');
  if(!visit||now-visit.at>30*60*1000){
   let source='direct';try{const host=new URL(document.referrer).hostname;if(host!==location.hostname)source=/google\./.test(host)?'google':/bing\./.test(host)?'bing':/instagram\./.test(host)?'instagram':/linkedin\./.test(host)?'linkedin':'referral'}catch{}
   visit={id:crypto.randomUUID(),at:now,count:0,source:campaignTag(params.get('utm_source'))||source,medium:campaignTag(params.get('utm_medium'))||'none',campaign:campaignTag(params.get('utm_campaign'))||'none',content:campaignTag(params.get('utm_content'))||'none'};
  }
  if(visit.count>=100)return;
  visit.count++;visit.at=now;sessionStorage.setItem(key,JSON.stringify(visit));
  const body=JSON.stringify({...visit,id:crypto.randomUUID(),visit:visit.id,event,view,device:innerWidth<768?'mobile':innerWidth<1024?'tablet':'desktop'});
  void fetch('/api/marketing/events',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
 }catch{/* Analytics must never interrupt scheduling. */}
}
