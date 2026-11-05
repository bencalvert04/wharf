import type {Metadata} from 'next';
import styles from '../privacy/privacy.module.css';
export const metadata:Metadata={title:'Wharf for Slack',description:'Find a time together, right in your Slack conversation.'};
export const dynamic='force-dynamic';
const messages:Record<string,string>={success:'Wharf is connected. Invite @Wharf to a small channel or group DM to get started.',cancelled:'Installation was cancelled. You can try again whenever you are ready.',invalid:'This installation link has expired or was opened in a different browser. Start again below.',failed:'Slack installation could not finish. Please try again or contact support.',unavailable:'Public installation is being prepared. Contact us to join the pilot.'};
export default async function SlackPage({searchParams}:{searchParams:Promise<{install?:string}>}){
 const {install}=await searchParams;
 const enabled=process.env.SLACK_PUBLIC_INSTALL_ENABLED==='true';
 return <main className={styles.policy}>
  <a href="/">← Wharf</a><p style={{marginTop:32}}>WHARF FOR SLACK</p>
  <h1>Find a time together.</h1>
  <p>Ask Wharf to arrange a meeting in your Slack conversation. It gathers calendar availability, suggests a shared time, and sends Google Calendar invitations when the organizer confirms.</p>
  {install&&messages[install]&&<p role="status" style={{padding:20,background:'var(--surface, #f0f3ee)',borderRadius:12}}>{messages[install]}</p>}
  <p>{enabled?<a href="/api/slack/install" style={{display:'inline-block',background:'#36572e',color:'#fff',padding:'12px 24px',borderRadius:8,textDecoration:'none',fontWeight:600}}>Add to Slack</a>:<a href="mailto:bencalvert04@gmail.com?subject=Wharf%20Slack%20pilot">Request pilot access</a>}</p>
  <p>Free pilot. Your workspace may require an administrator to approve installation.</p>
  <section><h2>From conversation to calendar</h2><ol>
   <li>Install Wharf and invite <strong>@Wharf</strong> to a small public channel or group DM.</li>
   <li>Try <strong>“@Wharf schedule a 30 minute meeting tomorrow afternoon.”</strong> Wharf includes the human members of that conversation. Use a dedicated conversation for the people you want to invite.</li>
   <li>Each participant connects their Google Calendar through a private prompt. Wharf can reuse a previously connected calendar.</li>
   <li>The requester confirms the suggested time and authorizes Google Calendar booking. Guests receive invitations from Google.</li>
  </ol></section>
  <section><h2>You stay in control</h2><p>Wharf checks free and busy times without reading existing event titles or descriptions. Individual busy times and calendar credentials are never posted to Slack or sent to AI services. Only the requester can confirm booking.</p><p>To understand scheduling requests, Wharf sends message text and a limited amount of relevant conversation context to Anthropic or Typesafe. Do not include confidential information in scheduling messages. Read our <a href="/privacy#slack">Slack privacy details</a>.</p></section>
  <section><h2>What the pilot supports</h2><p>Public channels and group DMs with up to 50 members. Google Calendar availability and invitations. Up to 100 scheduling requests per workspace each day. Workspace-level installation only; organization-wide installations and private channels are not supported.</p><p>Start each meeting in a new thread. Wharf does not continuously monitor calendars or cancel events when you remove the app. Manage changes to a booked event in Google Calendar.</p></section>
  <section><h2>Need a hand?</h2><p><a href="/support">Setup and troubleshooting</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p></section>
 </main>;
}
