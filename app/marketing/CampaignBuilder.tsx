'use client';
import {useState} from 'react';
import {campaignTag} from '@/lib/marketing/events';
export default function CampaignBuilder(){
 const [source,setSource]=useState('byu'),[medium,setMedium]=useState('qr'),[campaign,setCampaign]=useState('campus-launch'),[content,setContent]=useState('library-poster'),[copied,setCopied]=useState(false);
 const valid=[source,medium,campaign,content].every(v=>!!campaignTag(v));
 const url='https://wharfmeetings.com/?'+new URLSearchParams({utm_source:campaignTag(source),utm_medium:campaignTag(medium),utm_campaign:campaignTag(campaign),utm_content:campaignTag(content)});
 return <section><h2>Campaign links</h2><p>Use one link per placement. Tags use letters, numbers, hyphens and underscores. Never put a person’s name or email in a tag.</p><div className="marketing-fields">{[['Source',source,setSource],['Medium',medium,setMedium],['Campaign',campaign,setCampaign],['Placement',content,setContent]].map(([label,value,set])=><label key={label as string}>{label as string}<input maxLength={64} value={value as string} onChange={e=>{(set as (s:string)=>void)(e.target.value);setCopied(false)}}/></label>)}</div><output>{valid?url:'Complete all four tags using the allowed characters.'}</output><button disabled={!valid} onClick={async()=>{try{await navigator.clipboard.writeText(url);setCopied(true)}catch{setCopied(false)}}}>{copied?'Copied':'Copy campaign link'}</button></section>;
}
