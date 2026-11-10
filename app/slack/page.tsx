import type {Metadata} from 'next';
import Link from 'next/link';
import {Lato} from 'next/font/google';
import {ArrowRight, ArrowUpRight, AtSign, CalendarCheck, CalendarPlus, Check, CircleAlert, EyeOff, Lock, MessageSquareText, ShieldCheck, UserCheck} from 'lucide-react';
import SlackEntrance from '@/components/SlackEntrance';
import SlackPageHeader from '@/components/SlackPageHeader';
import SlackDemo from '@/components/SlackDemo';
import styles from './slack.module.css';

export const metadata:Metadata={title:'Wharf for Slack',description:'Find a time together, right in your Slack conversation.'};
export const dynamic='force-dynamic';
const lato=Lato({subsets:['latin'],weight:['400','700','900']});

const messages:Record<string,{tone:'success'|'error';text:string}>={
 success:{tone:'success',text:'Wharf is connected. Invite @Wharf to a small channel or group DM to get started.'},
 cancelled:{tone:'error',text:'Installation was cancelled. You can try again whenever you are ready.'},
 invalid:{tone:'error',text:'This installation link has expired or was opened in a different browser. Start again below.'},
 failed:{tone:'error',text:'Slack installation could not finish. Please try again or contact support.'},
 unavailable:{tone:'error',text:'Public installation is being prepared. Contact us to join the pilot.'},
};

const steps=[
 {icon:AtSign,title:'Invite @Wharf',body:<>Install Wharf and invite <strong>@Wharf</strong> to a small public channel or group DM.</>},
 {icon:MessageSquareText,title:'Ask for a time',body:<>Try <q>@Wharf schedule a 30 minute meeting tomorrow afternoon.</q> Wharf includes the human members of that conversation, so use a dedicated conversation for the people you want to invite.</>},
 {icon:CalendarPlus,title:'Everyone connects',body:<>Each participant connects their Google Calendar through a private prompt. Wharf can reuse a previously connected calendar.</>},
 {icon:CalendarCheck,title:'Confirm and book',body:<>The requester confirms the suggested time and authorizes Google Calendar booking. Guests receive invitations from Google.</>},
];

const limits=[
 ['Conversations','Public channels and group DMs, up to 50 members'],
 ['Calendars','Google Calendar availability and invitations'],
 ['Volume','Up to 100 scheduling requests per workspace each day'],
 ['Installation','Workspace-level only. Org-wide installs and private channels are not supported'],
];

export default async function SlackPage({searchParams}:{searchParams:Promise<{install?:string}>}){
 const {install}=await searchParams;
 const status=install?messages[install]:undefined;
 const cta=<a href="/api/slack/install" className="primary pill">Add to Slack <ArrowRight size={16}/></a>;

 return <div className="app light agent-shell" data-slack-shell>
  <SlackPageHeader/>

  <SlackEntrance>
   <section className={styles.hero}>
    <div className={styles.heroCopy} data-hero-copy>
     <h1>Wharf lives where your team is already working.</h1>
     {status&&<p role="status" className={`${styles.status} ${status.tone==='success'?styles.success:styles.error}`}>{status.tone==='success'?<Check size={16}/>:<CircleAlert size={16}/>}<span>{status.text}</span></p>}
     <div className={styles.actions}>{cta}<Link href="/support" className="outline pill">Setup guide</Link></div>
     <p className={styles.fine}>Your workspace may require an administrator to approve installation.</p>
    </div>
    <SlackDemo fontClass={lato.className}/>
   </section>

   <section className={styles.section}>
    <div className={styles.sectionHead}><span className={styles.eyebrow}>How it works</span><h2>From conversation to calendar</h2></div>
    <ol className={styles.steps}>
     {steps.map(({icon:Icon,title,body},i)=><li key={title}>
      <div className={styles.stepTop}><span className={styles.stepIcon}><Icon size={18}/></span><span className={styles.stepNum}>0{i+1}</span></div>
      <h3>{title}</h3><p>{body}</p>
     </li>)}
    </ol>
   </section>

   <section className={styles.section}>
    <div className={styles.sectionHead}><span className={styles.eyebrow}>Privacy</span><h2>You stay in control</h2></div>
    <div className={styles.trust}>
     <div><EyeOff size={18}/><h3>Free and busy only</h3><p>Wharf checks free and busy times without reading existing event titles or descriptions.</p></div>
     <div><Lock size={18}/><h3>Nothing private in Slack</h3><p>Individual busy times and calendar credentials are never posted to Slack or sent to AI services.</p></div>
     <div><UserCheck size={18}/><h3>Requester confirms</h3><p>Only the requester can confirm booking. Calendar invitations wait for their approval.</p></div>
    </div>
    <div className={styles.notice}>
     <ShieldCheck size={18}/>
     <p>To understand scheduling requests, Wharf sends message text and a limited amount of relevant conversation context to Anthropic or Typesafe. Do not include confidential information in scheduling messages. <Link href="/privacy#slack">Read our Slack privacy details <ArrowUpRight size={12}/></Link></p>
    </div>
   </section>

   <section className={styles.section}>
    <div className={styles.sectionHead}><span className={styles.eyebrow}>Pilot scope</span><h2>What the pilot supports</h2></div>
    <dl className={styles.specs}>{limits.map(([term,detail])=><div key={term}><dt>{term}</dt><dd>{detail}</dd></div>)}</dl>
    <p className={styles.footnote}>Start each meeting in a new thread. Wharf does not continuously monitor calendars or cancel events when you remove the app. Manage changes to a booked event in Google Calendar.</p>
   </section>

   <section className={styles.closing}>
    <h2>Need a hand?</h2>
    <p>Setup help, troubleshooting, and answers to common questions.</p>
    <div className={styles.actions}>{cta}<Link href="/support" className="outline pill">Get support</Link></div>
   </section>
  </SlackEntrance>

  <footer><span>Wharf for Slack</span><span className={styles.footerLinks}><Link href="/support">Support</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></span></footer>
 </div>;
}
