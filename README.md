# Wharf

Shared meeting availability for people and agents. Next.js on Vercel, Neon Postgres, Google Calendar free/busy.

## Run and deploy

Node 22.13 or later is required. Run `npm ci`, configure `.env.local`, then `npm run dev`. Use `npm run build` for a production build.

Production configuration: `APP_URL`, `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY` (32 random bytes encoded as 64 hex characters), and `CRON_SECRET`. Register `APP_URL/api/auth/google/callback` in Google Cloud. Run `node --env-file=.env.production.local scripts/migrate.mjs` before deploying schema-dependent code. The migration is additive and can be rerun.

Do not commit environment files, planner keys, invitation tokens, or MCP credential stores. `.env.example` documents configuration names without credentials.

## Calendar and privacy

Google sign-in identifies the user. Attending a meeting asks for ongoing primary-calendar free/busy access if no saved grant exists. Refresh tokens are encrypted, authenticated, and bound to the Google account. Wharf uses them when the person joins a meeting and for on-demand availability refreshes when the Slack bot suggests a time after calendars connect or finds a time to book; it does not continuously refresh existing snapshots. Disconnecting revokes the grant and deletes its connection record (including encrypted credentials, account identifier, scopes and version metadata). If revocation cannot be confirmed, local use is paused and the connection record is kept only for a retry. Existing meeting snapshots, memberships and sessions are not deleted by disconnect.

Only free/busy intervals within the meeting's working hours are stored. Event titles, descriptions, guests and locations are not read. Planner credentials and joined browser sessions can read aggregate availability and names, not individual busy intervals. Invitation URLs expose meeting constraints and any confirmed time. A personal invitation token additionally reveals its intended participant label.

Requests expire after 30 days and are removed by the daily cleanup route. Google profile fields are held in server-side Neon session records; the browser stores only an opaque HTTP-only session cookie. Browser sessions expire after 30 days. Calendar write access is requested separately from planners who choose native Google Calendar invitations. A separate planner-only endpoint can send RSVP invitations through Gmail SMTP; agent finalization never invokes it. Demo meetings remain private to their creating browser and use clearly labeled sample calendars.

## Agent workflow

Start at `/agents`, `/llms.txt`, or `/api/agent`. The versioned API contract is `/api/openapi`. New agents should use `/api/v1/meetings`, not the legacy browser API.

- `POST /api/v1/meetings`: create a named participant roster. The client generates and saves a unique random 32-byte base64url Bearer key before sending; `Idempotency-Key` makes retries recoverable. One key is scoped to one meeting. Reusing the same keys with changed input returns 409. Retry records last for the meeting's 30-day retention period.
- `GET /api/v1/meetings/:id`: status, exact missing participants, capture timestamps, private invitation links, and a recommended next action. No cookies required.
- `GET /api/v1/meetings/:id/slots`: paginated exact-duration, future-only slots after everyone responds, with explicit local/UTC times and a revision.
- `POST /api/v1/meetings/:id/finalize`: confirm a returned slot ID with its revision. Conditional updates reject stale responses. Identical retries are safe. No Google event or notification is created.

Personal invitation links bind a verified Google identity to a roster position after that person connects their calendar. They are private claim capabilities, not email identity verification. The organizer sees the actual Google display name. One account cannot fill multiple positions. Before Google booking, withdrawing availability releases that position and clears a saved time. Booking freezes attendance and time. Availability remains a snapshot, not live calendar synchronization.

Finalization stores `requests.final_time`, displays it on the meeting page, and removes the meeting from Pending meetings. Pending lists are scoped to the owning browser session or joined Google identity. Agent keys do not grant access to unrelated browser/account meetings.

### MCP

`node /absolute/path/to/wharf/scripts/mcp.mjs` starts the official SDK's stdio server. Five tools cover creation, locally known meetings, status, slots, and finalization. It exposes `wharf://guide` as a resource.

`WHARF_URL` defaults to `https://wharf-delta.vercel.app`. `WHARF_STATE_DIR` defaults to `~/.config/wharf`; credentials are separated by origin, written before network requests, and stored with owner-only file permissions. The bridge never returns planner keys to the model. Use the same directory across restarts to preserve retry recovery. A crashed process can leave a lock directory; remove it only after confirming the old process has stopped. This is a local stdio MCP bridge, not a hosted OAuth MCP endpoint.

Example MCP client configuration:

```json
{"mcpServers":{"wharf":{"command":"node","args":["/absolute/path/to/wharf/scripts/mcp.mjs"]}}}
```

### Verification

`npm test` covers normalization, validation, exact-duration slots, DST, snapshot parsing, token handling and existing behavior. `npm run build` checks all routes and types.

Against a local server at `http://127.0.0.1:3004`:

- `npm run test:agents` uses synthetic database rows to check concurrent idempotency, permissions, invitation claims, response tracking, pagination, stale revisions, finalization races, withdrawal and expiry.
- `npm run test:mcp` uses the official MCP client, including process restart/retry recovery and private credential storage.
- `scripts/verify-account.mjs`, `scripts/verify-demo.mjs`, and `scripts/verify-pending.mjs` check existing account, demo and pending-list behavior.

The agent/MCP scripts read `.env.production.local`; set `TEST_URL` to change their server target. Test records are removed in finally blocks. These tests use synthetic calendar snapshots and do not authorize Google on a real person's behalf. Live consent still requires the person to sign in themselves.

## Optional Gmail invitation delivery

The existing planner-only `POST /api/requests/:id/invitations` queues and sends private calendar requests for an already-finalized browser meeting. Configure `INVITATION_FROM` and `GMAIL_APP_PASSWORD` and run `npm run email:verify` to verify SMTP authentication without sending. Verified attendee emails are private and not returned by meeting APIs. Older attendees need to reconnect Google to provide verified email. The durable outbox prevents duplicate queuing; ambiguous SMTP outcomes require manual review in Gmail Sent before any resend. Accepted means Gmail accepted delivery, not that a recipient received or accepted it. Rescheduling, cancellation messages and RSVP tracking are not implemented. Agent finalization is deliberately separate from this sending endpoint.

## Browser planner finalization

The planner joins with Google, selects a valid time, and uses Create meeting. `POST /api/requests/:id/finalize` validates the browser’s availability revision, freezes the selected time and attendees, atomically queues the planner and attendee email recipients, and dispatches Gmail invitations. It uses a separate contract from `/api/v1/meetings/:id/finalize`, which only confirms an agent meeting without sending. `scripts/verify-finalization.mjs` verifies the browser transaction, outbox idempotency and frozen-attendee behavior using synthetic data without sending email.

Planners can permanently delete meetings from Pending meetings or the meeting page. The planner-only `DELETE /api/requests/:id` removes the meeting and its saved availability; previously sent calendar invitations are not cancelled. Idempotency recovery ends when a meeting is deliberately deleted or expires.

## Native Google Calendar invitations

Browser planners now create a native event on their primary Google Calendar when they confirm a meeting time. A separate, planner-only consent flow requests `calendar.events.owned` alongside the existing free/busy scope. Guests are invited with `sendUpdates=all`; Google Calendar invitation settings determine whether the event is added automatically or after RSVP. Attendee write permission is not requested, and responses are never accepted on their behalf.

Run `npm run db:migrate` before deploying. The additive migration stores granted scopes, OAuth flow purpose, and an immutable Google event job. The selected time and guest list are frozen atomically. A deterministic Google event ID plus lookup before insert recovers timed-out calls without intentionally sending duplicate invitations. Pending jobs can be retried from the meeting page. Old SMTP jobs retain their delivery path; new Google events do not also send SMTP/ICS invitations. Existing queued emails are unchanged. Agent finalization still does not send invitations.

The planner must approve the extra permission in Google. The OAuth consent configuration must allow the new scope; production verification may be required by Google. Disconnecting stops future access. Deleting or expiring a Wharf meeting does not cancel the external Google event; planners manage it in Google Calendar.


### Agent Google Calendar booking

After everyone joins, call `wharf_prepare_calendar` (REST `POST /api/v1/meetings/:id/calendar`) with `organizerParticipantId`. Share the private `authorizationUrl` with that organizer. They must use the same Google account that joined and explicitly authorize this agent to book this particular meeting, even if Google event permission was previously granted.

Then call `wharf_book_meeting` (REST `POST /api/v1/meetings/:id/book`) with an authorized `slotId` and its `revision`. This atomically freezes the selected time and native event job, creates an event on the organizer's primary Google Calendar, and requests Google invitations to all joined guests. `calendar.status: created` confirms provider acceptance, while `pending` requires retrying the same inputs after 30 seconds. Guest settings control automatic calendar appearance. The existing `finalize` operation remains save-only; its original `finalTime.slotId` and `finalTime.basedOnRevision` can be used to book that choice while it is still in the future.

Organizer selection is fixed for a meeting. Event booking requires verified attendee emails, a complete roster, and a usable organizer grant. Revoked permission can be renewed through the same private authorization link. Calendar event jobs block attendance withdrawal so the external event remains consistent. Deleting Wharf data does not cancel the event.

`node --env-file=.env.production.local --import tsx scripts/verify-agent-booking.mjs` checks organizer identity/consent, grant renewal, stale revisions, concurrent queueing, pending/created retries, privacy and save-only upgrades without contacting Google or sending messages. Run against a local test server with a matching test-only encryption key; the script uses synthetic accounts and cleans its records. Provider transport is independently covered by fake-client tests.

## Slack bot

The single-workspace Slack integration uses Anthropic for request interpretation by default, or Typesafe Jev when `SLACK_INTERPRETER=jev`; Jev mode can still use Anthropic to word short replies. It uses organizer-only controls for confirmation and booking. See [setup and demo instructions](docs/slack.md) and the [Slack app manifest](docs/slack-manifest.json).

## Pending meeting retention and re-entry

Before deploying, run the additive migration for `requests.last_activity_at`, retained `meeting_memberships`, and their activity/history triggers. Existing current attendees are backfilled; memberships for people who already left before the migration cannot be reconstructed from deleted attendee records. Initial activity for old requests uses the later of creation and the latest recorded calendar snapshot. No production migration has been run for this change.

Leaving removes the attendee’s availability but retains a private Google-identity membership association so their unfinished meeting remains in Pending meetings with a Rejoin meeting link. Former participants cannot read aggregate availability until they rejoin. Agent-roster invitations remember the original slot; re-entry cannot steal a slot claimed by someone else. Signing out hides identity-scoped membership cards until the same account signs in again. Memberships cascade away when the meeting is deleted or expires.

Pending lists exclude all finalized requests and requests with no activity for seven elapsed days (7 × 24 hours). Activity means creation, joining/reconnecting, leaving, changing scheduling constraints/finalization, or a deliberate page entry by the planner or a current/former participant. The timer is meeting-wide: meaningful activity by any participant resets it for everyone. GET polling, focus refreshes, and opening the Pending meetings list do not touch activity.

The seven-day rule hides cards, rather than deleting meeting records. A deliberate visit using the original link can restore an unfinished meeting to Pending while it remains within the existing 30-day retention period. The pre-existing 30-day expiry still applies even if activity is recent. The explicit POST activity endpoint checks same-origin and session membership and cannot reactivate a finalized meeting or let an unrelated visitor keep one alive.

Every Pending card also offers **Remove from Pending**, which persists a dismissal for the current Google identity (or the creator’s browser session when signed out). It does not withdraw availability, cancel invitations, delete the meeting, or affect anyone else’s list. Other participants’ activity does not undo this personal removal. Opening the original meeting link deliberately, or joining again, restores only that user’s card. The planner’s separate **Delete for everyone** action still performs permanent global deletion with its existing confirmation. Dismissals cascade away with the meeting.

## Connection deletion rollout

Before deploying connection-deletion code, apply the additive statements in `db/calendar-connection-schema.mjs` through the normal migration process. They add a per-connection UUID and capture it in new OAuth states, preventing a stale callback from overwriting a reconnected account after its old record is deleted. The statements are repeatable and do not delete records. The two additive columns were applied to the connected Wharf production database on 2026-10-27 before this application rollout.

OAuth flows started before the new application version may fail closed and require starting consent again; existing saved grants remain usable. Roll out the application without leaving old callback handlers active alongside new deletion handlers. Rolling back to code that checks only numeric versions is unsafe for callbacks that span a disconnect/reconnect; drain pending OAuth flows (10-minute expiry) and disable disconnect/consent traffic during such a rollback, or retain the generation checks. Do not remove the additive columns as part of rollback.
