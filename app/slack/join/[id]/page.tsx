import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {sql,session} from '@/lib/auth';
import {openToken} from '@/lib/token-vault';
import {invitationToken} from '@/lib/agent-api';

export const dynamic='force-dynamic';
export const metadata={title:'Join a meeting · Wharf',robots:{index:false,follow:false}};

export default async function JoinSlackMeeting({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const [row]=await sql()`SELECT s.id,s.draft,s.key_cipher,s.meeting_id,r.constraints,r.final_time FROM slack_meetings s JOIN requests r ON r.id=s.meeting_id WHERE s.id=${id} AND r.created_at::timestamptz>now()-interval '30 days'`;
 if(!row)notFound();
 const c=JSON.parse(row.constraints);
 if(row.draft.openJoin)redirect(`/?meeting=${encodeURIComponent(row.meeting_id)}`);
 const viewer=await session();
 const people=await sql()`SELECT id,name,google_sub FROM request_invitees WHERE meeting_id=${row.meeting_id} ORDER BY position`;
 const key=openToken(row.key_cipher,`slack:${row.id}`);
 return <div className="app light agent-shell"><header><Link className="brand" href="/" style={{color:'inherit',textDecoration:'none'}}>Wharf</Link></header><main className="agent-docs" style={{maxWidth:640,padding:'32px 20px',margin:'0 auto'}}><span className="small-tag">YOU'RE INVITED</span><h1 style={{overflowWrap:'anywhere'}}>{c.title}</h1><p>{c.duration} minutes · {c.start} to {c.end}<br/>{c.windowStart?`${c.windowStart.replace('T',' ')} to ${c.windowEnd.replace('T',' ')}`:`${c.from}–${c.to}`} ({c.zone})</p><section><h2>{row.final_time?'Meeting confirmed':'Join the meeting'}</h2><p>{row.final_time?'Open the meeting to see the selected time.':'Choose your name, then connect your Google Calendar to share availability.'}</p><div style={{display:'grid',gap:12}}>{people.map(p=>{
 const claimed=p.google_sub&&p.google_sub!==viewer?.google_sub;
 const href=`/?meeting=${row.meeting_id}&invite=${invitationToken(key,row.meeting_id,p.id)}`;
 return claimed?<div key={p.id} className="outline" style={{padding:16}}>{p.name} · Joined</div>:<Link key={p.id} className="outline" style={{padding:16,display:'flex',justifyContent:'space-between',gap:12,textDecoration:'none'}} href={href}>{p.name}<span>Join →</span></Link>;
 })}</div></section></main></div>;
}
