import type {Metadata} from 'next';
import {privacyPolicy,googleDataSharing,googleDataProtection} from '@/lib/privacy-policy';
import styles from './privacy.module.css';

export const metadata:Metadata={title:'Privacy Policy | Wharf',description:'How Wharf accesses, uses, shares, protects, and retains account and calendar data.'};

export default function Privacy(){
 return <main className={styles.policy}>
  <a href="/">← Wharf</a><h1>Wharf Privacy Policy</h1>
  <p>Last updated: November 2, 2026</p>
  <p>This policy explains how Wharf handles your information when you use its website, Google, Outlook, or iCloud calendar connections, agent API, and Slack integration.</p>
  <nav aria-label="Privacy policy sections"><ul>
   <li><a href="#google-data">Google data we access and use</a></li>
   <li><a href="#other-calendars">Outlook and iCloud calendars</a></li>
   <li><a href="#data-sharing">Who receives Google user data</a></li>
   <li><a href="#data-protection">How we protect Google user data</a></li>
   <li><a href="#retention">Retention, disconnection, and deletion</a></li>
  </ul></nav>
  <section id="google-data"><h2>Google data we access and use</h2><p>{privacyPolicy.availability}</p><p>{privacyPolicy.profile}</p></section>
  <section id="other-calendars"><h2>Outlook and iCloud calendars</h2><p>{privacyPolicy.otherCalendars}</p></section>
  <section id="data-sharing"><h2>Who receives Google user data</h2>
   <p>We share, transfer, or disclose Google user data and derived shared availability to the following recipients for these purposes:</p>
   {googleDataSharing.map(({recipient,details})=><div key={recipient}><h3>{recipient}</h3><p>{details}</p></div>)}
  </section>
  <section id="data-protection"><h2>How we protect Google user data</h2>
   {googleDataProtection.map(({mechanism,details})=><div key={mechanism}><h3>{mechanism}</h3><p>{details}</p></div>)}
  </section>
  <section id="limited-use"><h2>Limited Use and AI restrictions</h2><p>{privacyPolicy.limitedUse}</p><p><a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a></p></section>
  <section id="agents"><h2>Organizer-authorized agents</h2><p>{privacyPolicy.agents}</p></section>
  <section id="slack"><h2>Slack scheduling and AI processing</h2><p>{privacyPolicy.slack}</p></section>
  <section id="retention"><h2>Retention, disconnection, and deletion</h2><p>{privacyPolicy.connection}</p><p>{privacyPolicy.retention}</p></section>
  <section id="contact"><h2>Contact</h2><p>{privacyPolicy.contact}</p></section>
 </main>;
}
