import Link from 'next/link';
import {appUrl} from '@/lib/auth';

export default function Agents(){
 const base=appUrl();
 return <div className="app light agent-shell">
  <header><Link href="/" className="brand" style={{color:'inherit',textDecoration:'none'}}><span className="brandmark" aria-hidden="true">⚓️</span>Wharf</Link><nav><Link href="/api/openapi">OpenAPI</Link><Link href="/llms.txt">Agent guide</Link></nav></header>
  <main className="agent-docs">
   <span className="small-tag">For agents</span>
   <h1>One request. One link. Meet together.</h1>
   <p>Planning a meeting in a group chat? Give Wharf a date and timezone, then share the link it returns. Everyone connects their calendar in one place.</p>
   <section><h2>Start without signing up</h2><p>No account, API key registration, SDK, or installation required. Generate and save a random UUID once for this request, then reuse it if you need to retry.</p>
    <pre>{`POST ${base}/api/v1/meeting-links
Content-Type: application/json
Idempotency-Key: <your saved random UUID v4>

${JSON.stringify({startDate:'2030-01-07',timezone:'America/Denver'},null,2)}`}</pre>
    <p>Use the date and timezone from the conversation. Meetings default to 30 minutes, between 9 AM and 5 PM on that date. Add a title, endDate, durationMinutes, or different hours as needed.</p>
   </section>
   <section><h2>Share the returned link</h2><p>The response includes <code>invitationUrl</code> and a ready-to-send <code>shareMessage</code>. Post either in the authorized group chat. Everyone uses the same link, with no participant list to assemble.</p><p>The first person to connect becomes the planner. People join as themselves, then the planner chooses a time and sends invitations on Wharf. Creating a link collects availability; the meeting is booked only after the planner confirms it. Availability covers the people who joined.</p><p>Keep your request ID private. After a timeout, resend the same body and Idempotency-Key to recover the same link. Changing the body with the same key returns a conflict. Links expire after 30 days.</p></section>
   <section><h2>Everything an agent needs to discover Wharf</h2><div className="agent-links"><Link href="/llms.txt">Plain-text guide ↗</Link><Link href="/api/agent">Discovery JSON ↗</Link><Link href="/api/v1/meeting-links">Quickstart JSON ↗</Link><Link href="/openapi.json">OpenAPI contract ↗</Link></div><p>Give your agent <code>{base}/llms.txt</code> to get started. The API route itself also explains how to use it when read with GET.</p></section>
   <section><h2>Want the agent to keep coordinating?</h2><p>Use <code>/api/v1/meetings</code> for response tracking, exact time slots, private invitations to a fixed roster, and organizer-authorized Google Calendar booking. Meeting responses include five exact options in availability.slots, plus actions with REST request templates and equivalent MCP arguments. Choose only a user-authorized time; pollAfterSeconds gives the minimum delay between checks. See the <Link href="/llms.txt">advanced workflow</Link> for credentials and consent.</p></section>
   <section><h2>Already using MCP?</h2><p>Clone the repository, run <code>npm ci</code>, and add this server to your MCP client.</p><pre>{JSON.stringify({mcpServers:{wharf:{command:'node',args:['/absolute/path/to/wharf/scripts/mcp.mjs']}}},null,2)}</pre><p>Call <code>wharf_create_meeting</code> with <code>startDate</code>, <code>timezone</code>, <code>openJoin: true</code>, and a stable <code>idempotencyKey</code>. Share the returned <code>invitationUrl</code>. The bridge manages credentials for the advanced workflow.</p><a href="https://github.com/bencalvert04/wharf">Get the source ↗</a></section>
  </main>
 </div>;
}
