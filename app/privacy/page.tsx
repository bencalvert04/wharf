import type {Metadata} from 'next';
import styles from './privacy.module.css';

export const metadata:Metadata={title:'Privacy Policy | Wharf',description:'How Wharf uses and protects your account, calendar, and scheduling information.'};

export default function Privacy(){
 return <main className={styles.policy}>
  <a href="/">← Wharf</a>
  <h1>Wharf Privacy Policy</h1>
  <p>Last updated: November 4, 2026</p>
  <p>This policy explains how Wharf handles information when you use its website, calendar connections, agent API, or Slack integration.</p>
  <nav aria-label="Privacy policy sections"><ul>
   <li><a href="#google-data">Google sign-in and calendar</a></li>
   <li><a href="#apple-signin">Sign in with Apple</a></li>
   <li><a href="#other-calendars">Outlook and iCloud calendars</a></li>
   <li><a href="#data-sharing">Who receives your information</a></li>
   <li><a href="#data-protection">How we protect your information</a></li>
   <li><a href="#limited-use">Google Limited Use</a></li>
   <li><a href="#agents">Organizer-authorized agents</a></li>
   <li><a href="#slack">Slack and AI services</a></li>
   <li><a href="#retention">Your choices and retention</a></li>
   <li><a href="#contact">Contact</a></li>
  </ul></nav>

  <section id="google-data"><h2>Google sign-in and calendar</h2>
   <p>When you sign in with Google, we store your account ID, display name, verified email address, and profile photo URL in a server-side session record in Neon Postgres. Your browser gets an HTTP-only session cookie, not those profile details. Signing in alone does not read your calendar or join a meeting.</p>
   <p>When you connect Google Calendar, Wharf requests ongoing access to your primary calendar’s free and busy times to find shared availability. It does not read existing event titles, descriptions, attendees, or locations for availability checks. We store busy times within the meeting’s permitted hours. The organizer and joined attendees can see names and calculated shared availability, but not your individual busy times.</p>
   <p>Organizers may also be asked for permission to create events on calendars they own. Guests do not need this permission to share availability. After a meeting is confirmed, Wharf creates an event on the organizer’s primary calendar. It may read that specific event to check delivery or recover an interrupted booking without sending duplicate invitations. It does not use this access to browse unrelated events. Guests can accept or decline the invitation, and their calendar settings determine when it appears.</p>
   <p>We store an encrypted refresh token so Wharf can check your availability for future meetings, including after you sign out and back in. For Slack suggestions or an organizer’s request to find and book a time, Wharf may refresh joined participants’ primary-calendar availability for the meeting’s date range. These checks happen on demand, not continuously. Browser confirmation uses the last saved availability, which may be out of date. A failed check does not replace an earlier snapshot or automatically prevent later browser confirmation.</p>
  </section>

  <section id="apple-signin"><h2>Sign in with Apple</h2>
   <p>Apple authenticates you and gives Wharf your Apple account ID, verified email address (which may be a private relay address), and name if you share it. We store this profile in Neon Postgres to recognize your account and display your session, and update it when you sign in again. Profiles not updated for 30 days are removed by daily cleanup. Your Apple password never enters Wharf.</p>
   <p>Apple sign-in does not read your iCloud calendar, add availability, or create invitations. Wharf verifies identity tokens during login and does not store them as calendar credentials.</p>
  </section>

  <section id="other-calendars"><h2>Outlook and iCloud calendars</h2>
   <p>You can connect Outlook using a Microsoft 365 or personal Microsoft account. Microsoft’s calendar-read permission can cover more than availability, but Wharf requests only start and end times, free/busy status, and cancellation status from your primary calendar, including recurring events.</p>
   <p>New iCloud connections are unavailable. Older connections used an Apple Account email and app-specific password, which grants broader calendar access, including event data and write access. Wharf uses read-only requests across accessible iCloud event calendars and temporarily processes the returned data to handle time zones and recurring events. It retains only busy times, and does not save event titles, descriptions, locations, or guest lists or send them to AI providers. All-day events use the calendar’s time zone, or the meeting’s time zone if the calendar has none. Unsupported floating times or unrecognized time zones cause the availability check to fail instead of treating the time as free.</p>
   <p>You can use these accounts without Google. Wharf stores your account ID, name, and invitation email in its server-side session system. Choosing Outlook or iCloud connects the calendar even outside a meeting. Microsoft refresh tokens and older iCloud app-specific passwords are encrypted on the server. Signing out does not disconnect a calendar; saved credentials remain until disconnected or replaced.</p>
   <p>Organizers using Outlook or iCloud send calendar invitations by email through Wharf’s configured sender. Wharf does not write directly to those calendars. Recipients control whether to accept the invitation and when it appears. These connections do not give the Slack agent authorization to book a native Google event for those organizers.</p>
  </section>

  <section id="data-sharing"><h2>Who receives your information</h2>
   <p>Wharf shares information with the following people and services to operate scheduling:</p>
   <ul>
    <li><strong>Vercel and Neon:</strong> Vercel hosts Wharf and processes account information, availability, credentials, and meeting data. Neon Postgres stores account and session details, busy times, granted permissions, encrypted credentials, and meeting and delivery records.</li>
    <li><strong>Meeting participants and authorized agents:</strong> Organizers and joined attendees can see participant names and shared availability. An organizer’s authorized agent can also receive response and booking status. They do not receive individual busy-time snapshots or Google credentials. Anyone with a meeting link can see meeting details and may be able to join an open meeting or claim an unclaimed invitation.</li>
    <li><strong>Google and invited guests:</strong> For a confirmed Google event, Wharf sends Google Calendar the title, time, time zone, meeting link, and invitees’ names and verified email addresses. Google creates the event and sends invitations. The organizer and guests can see event and guest information according to Google Calendar settings. Google also receives credentials when Wharf exchanges, refreshes, or revokes access. Gmail processes recipient addresses and meeting details for Outlook or iCloud organizers and older emailed invitations.</li>
    <li><strong>Slack and people in the conversation:</strong> Slack receives bot replies, meeting links, suggested shared times, and booking confirmations. People in the conversation can see them. Wharf does not post individual busy-time snapshots or Google credentials to Slack.</li>
    <li><strong>AI services:</strong> Anthropic (Claude) or Typesafe (Jev) processes Slack scheduling text and relevant conversation context as described below. Personal or calendar information you include in messages may be part of that context. Wharf does not send Google Calendar snapshots, Google credentials, or meeting access credentials to these services.</li>
   </ul>
  </section>

  <section id="data-protection"><h2>How we protect your information</h2>
   <p>Wharf uses HTTPS, encrypted connections to Google and Neon, and database encryption at rest. Google refresh tokens have an additional layer of AES-256-GCM encryption, tied to the account and protected by a server-side key stored separately from database records. Microsoft and older iCloud credentials are also encrypted with account-bound authenticated encryption.</p>
   <p>Google tokens stay on the server and are not exposed to participants’ browsers or through the meeting API. The production session cookie is Secure, HTTP-only, and SameSite=Lax. It holds a random session secret, and the database stores a hash of that secret. Sessions expire after 30 days.</p>
   <p>Wharf checks sessions, participation, organizer authority, and meeting-specific agent credentials before protected actions. Google authorization uses short-lived, single-use state, PKCE, and a nonce. Wharf verifies Google identity tokens and email addresses, and limits calendar access in application code to the meeting’s date range and the booking operations described here.</p>
  </section>

  <section id="limited-use"><h2>Google Limited Use</h2>
   <p>Wharf’s use and transfer of information from Google APIs follows the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including its Limited Use requirements. This applies to raw Google data and derived data such as shared availability. We use it only to provide and support the sign-in, scheduling, and invitation features described here.</p>
   <p>We do not sell Google user data, share it with advertisers or data brokers, use it for advertising or credit decisions, or use it to develop, improve, or train generalized AI or machine-learning models. Wharf’s application code matches availability and creates events. AI services interpret Slack scheduling text.</p>
  </section>

  <section id="agents"><h2>Organizer-authorized agents</h2>
   <p>For agent-created meetings, we store the organizer’s participant labels and link each private invitation to the calendar account that claims it. The organizer and authorized agent can see response status, participant names, and shared availability. An agent can save a meeting time without sending invitations.</p>
   <p>To book a Google event, the organizer must separately authorize the agent for that meeting. We store the authorization and use the organizer’s encrypted calendar grant to create one event and invite joined attendees at their invitation email addresses. Before booking, withdrawing availability clears a saved time. Once an event is queued, the meeting’s time and attendance are frozen.</p>
  </section>

  <section id="slack"><h2>Slack and AI services</h2>
   <p>When you use the Wharf Slack bot, we process scheduling messages that mention it, Slack user IDs, display names, and the scheduling time zone. Wharf responds only to mentions in configured conversations. To understand a request, it may also read up to 15 human messages from the preceding seven days in the conversation and thread, limited to 6,000 characters, along with author IDs and timestamps.</p>
   <p>Depending on the configured interpreter, Anthropic (Claude) or Typesafe (Jev) processes the scheduling text, relevant context, timestamps, and time zone to propose meeting details. Slack IDs may appear in that text. When Jev is selected, Anthropic may separately process limited message text to word a short reply. Neither provider receives Google Calendar snapshots, access tokens, or meeting credentials from Wharf.</p>
   <p>Slack receives replies, suggested shared times, and a meeting link. Anyone with the link can see meeting details and can join an open meeting or claim an unclaimed invitation with their calendar account. After joining, they can see participant names and shared availability. Organizer calendar authorization links are sent privately.</p>
   <p>For follow-up questions, Wharf separately stores up to 12 recent entries from the same requester’s thread, including their messages, Wharf’s clarification prompts, and proposed meeting details. It uses this context for up to one day after the last update; daily cleanup removes expired context. Relevant requester messages go to the configured interpreter, but background conversation history is not saved in this clarification record. Slack workflow records expire after 30 days, and successful job payloads are removed after processing.</p>
  </section>

  <section id="retention"><h2>Your choices and retention</h2>
   <h3>Remove availability or disconnect a calendar</h3>
   <p>Use “Remove my availability” on a meeting to remove your snapshot. This does not disconnect your calendar. Signing out also leaves your connection in place.</p>
   <p>Use “Disconnect Google Calendar” in your account menu to revoke Google access and delete the stored credentials and connection record, including the account ID, granted scopes, and connection-version metadata. If Google is temporarily unavailable, Wharf pauses access and keeps the encrypted credentials and connection metadata only to retry revocation. They are deleted when disconnection succeeds. You can also revoke access in your Google Account connections.</p>
   <p>Disconnecting Outlook or iCloud removes Wharf’s stored credentials. To revoke access at the provider, also remove Wharf’s Microsoft authorization or revoke the Apple app-specific password in your account settings. If the same Wharf identity has saved Google access, Disconnect also starts the Google revocation and deletion process above.</p>
   <p>To reject stale connection attempts, Wharf retains a separate one-way hash of the calendar account ID and an ordering number after disconnection. This marker contains no raw account ID, profile details, credentials, or availability. It becomes eligible for deletion 15 minutes after its latest use and is removed during later calendar activity or daily cleanup; delays are possible. Connection attempts expire after 10 minutes.</p>
   <p>Disconnecting does not delete your browser session, meeting membership, or availability snapshots already shared with meetings. These have the retention periods below.</p>
   <h3>Meetings and other records</h3>
   <p>Leaving a meeting removes your availability snapshot. Wharf keeps your calendar account ID, name, and membership so you can rejoin from Pending meetings, until the meeting is deleted or expires. You can remove a meeting from Pending without affecting others; Wharf keeps that preference until you reopen or rejoin it, or it is deleted or expires.</p>
   <p>Unfinished meetings disappear from Pending after seven days without activity. Requests expire after 30 days, and daily cleanup removes expired records and associated snapshots. Delivery records expire with their meeting. Browser sessions expire after 30 days. Deleting a meeting from Wharf does not cancel its Google Calendar event; cancel it in Google Calendar.</p>
  </section>
  <section id="contact"><h2>Contact</h2><p>Questions? Email <a href="mailto:bencalvert04@gmail.com">bencalvert04@gmail.com</a> or <a href="mailto:raycshaw36@gmail.com">raycshaw36@gmail.com</a>.</p></section>
 </main>;
}
