import {notFound} from 'next/navigation';
import {session} from '@/lib/auth';
import {neon} from '@neondatabase/serverless';
import {marketingAdmin} from '@/lib/marketing/events';
import CampaignBuilder from './CampaignBuilder';
import './marketing.css';
export const dynamic='force-dynamic';
export const metadata={title:'Wharf marketing',robots:{index:false,follow:false}};
export default async function Marketing({searchParams}:{searchParams:Promise<{days?:string}>}){
 const user=await session();
 if(!marketingAdmin(user?.email,process.env.MARKETING_ADMIN_EMAILS))notFound();
 const raw=(await searchParams).days,days=raw==='7'?7:raw==='90'?90:30;
 let daily:Record<string,any>[]=[],funnel:Record<string,any>[]=[],campaigns:Record<string,any>[]=[],devices:Record<string,any>[]=[],trend:Record<string,any>[]=[],error=false;
 try{const db=neon(process.env.DATABASE_URL!);
 [daily,funnel,campaigns,devices,trend]=await Promise.all([
 db`SELECT metric,sum(value)::int AS total FROM marketing_daily WHERE day>=(now() AT TIME ZONE 'UTC')::date-(${days}-1) GROUP BY metric`,
 db`SELECT event,count(*)::int AS events,count(DISTINCT visit)::int AS visits FROM marketing_events WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'-(${days}-1)*interval '1 day' GROUP BY event ORDER BY visits DESC`,
 db`SELECT source,medium,campaign,content,count(DISTINCT visit)::int AS visits,count(DISTINCT visit) FILTER(WHERE event='meeting_created')::int AS creators,count(DISTINCT visit) FILTER(WHERE event='attendance_completed')::int AS attendees FROM marketing_events WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'-(${days}-1)*interval '1 day' GROUP BY source,medium,campaign,content ORDER BY visits DESC LIMIT 100`,
 db`SELECT device,count(DISTINCT visit)::int AS visits FROM marketing_events WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'-(${days}-1)*interval '1 day' GROUP BY device ORDER BY visits DESC`,
 db`SELECT day::text,metric,value::int FROM marketing_daily WHERE day>=(now() AT TIME ZONE 'UTC')::date-(${days}-1) ORDER BY day DESC,metric`
 ]);
 }catch{error=true}
 const totals=Object.fromEntries(daily.map(r=>[r.metric,r.total]));
 return <main className="marketing-dashboard"><header><a href="/">← Wharf</a><h1>Marketing & product activity</h1><p>Private dashboard · UTC dates · last {days} calendar days</p><nav aria-label="Reporting period">{[7,30,90].map(n=><a key={n} aria-current={days===n?'page':undefined} href={'?days='+n}>{n} days</a>)}</nav></header>
 {error&&<p role="alert">Analytics storage is not ready. Run the marketing migration against this environment before enabling collection.</p>}
 <p>Browser collection: {process.env.MARKETING_ENABLED==='true'?'enabled':'disabled'}. Counts start when tracking is installed; no historical backfill.</p>
 <div className="marketing-cards">{[['Meetings created','meetings_created'],['Meetings finalized','meetings_finalized'],['Calendar joins','calendar_joins'],['Manual joins','manual_joins'],['Microsoft joins','microsoft_joins']].map(([label,key])=><section key={key}><span>{label}</span><strong>{error?'—':totals[key]||0}</strong></section>)}</div>
 <p>These are database-confirmed actions across website and integrations, excluding demo meetings. A join counts a newly inserted attendance record; leaving and rejoining can count again. Finalizations in this period may belong to meetings created earlier, so their ratio is not a cohort conversion rate.</p>
 <section><h2>Visitor activity</h2><p>Anonymous tab visits expire after 30 minutes of inactivity. These are not unique people or a sequential funnel. Browser blockers, privacy preferences, bots and interrupted requests affect counts.</p><div className="marketing-table"><table><thead><tr><th>Action</th><th>Visits with action</th><th>Total events</th></tr></thead><tbody>{funnel.map(r=><tr key={r.event}><td>{r.event.replaceAll('_',' ')}</td><td>{r.visits}</td><td>{r.events}</td></tr>)}</tbody></table></div>{!funnel.length&&<p>No visitor events in this period.</p>}</section>
 <section><h2>Campaign performance</h2><p>First-touch campaign within each tab visit. Creation and attendance columns are browser-reported successes, not the database totals above. Top 100 placements.</p><div className="marketing-table"><table><thead><tr>{['Source','Medium','Campaign','Placement','Visits','Creator visits','Attendee visits'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{campaigns.map((r,i)=><tr key={i}>{['source','medium','campaign','content','visits','creators','attendees'].map(k=><td key={k}>{r[k]}</td>)}</tr>)}</tbody></table></div></section>
 <section><h2>Device mix</h2>{devices.map(r=><p key={r.device}>{r.device}: {r.visits} visits</p>)}</section>
 <section><h2>Daily product activity</h2><div className="marketing-table"><table><thead><tr><th>Date (UTC)</th><th>Action</th><th>Count</th></tr></thead><tbody>{trend.map(r=><tr key={r.day+r.metric}><td>{r.day}</td><td>{r.metric.replaceAll('_',' ')}</td><td>{r.value}</td></tr>)}</tbody></table></div></section>
 <CampaignBuilder/><footer>Visitor events are retained for 90 days. Aggregate product counts contain no participant or meeting identifiers. No session recordings, calendar details, full URLs, or advertising pixels are collected.</footer></main>;
}
