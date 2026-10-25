# Wharf

Shared meeting availability for people and agents. Next.js on Vercel, Neon Postgres, Google Calendar free/busy.

## Run and deploy

Node 22.13 or later is required. Run `npm ci`, configure `.env.local`, then `npm run dev`. Use `npm run build` for a production build.

Production configuration: `APP_URL`, `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY` (32 random bytes encoded as 64 hex characters), and `CRON_SECRET`. Register `APP_URL/api/auth/google/callback` in Google Cloud. Run `node --env-file=.env.production.local scripts/migrate.mjs` before deploying schema-dependent code. The migration is additive and can be rerun.

Do not commit environment files, planner keys, invitation tokens, or MCP credential stores. `.env.example` documents configuration names without credentials.

## Calendar and privacy

Google sign-in identifies the user. Attending a meeting asks for ongoing primary-calendar free/busy access if no saved grant exists. Refresh tokens are encrypted, authenticated, and bound to the Google account. Wharf uses them when the person joins a meeting; it does not continuously refresh existing snapshots. Disconnecting revokes the grant. If revocation cannot be confirmed, local use is paused and encrypted credentials are kept only for a retry.

Only free/busy intervals within the meeting's working hours are stored. Event titles, descriptions, guests and locations are not read. Planner credentials and joined browser sessions can read aggregate availability and names, not individual busy intervals. Invitation URLs expose meeting constraints and any confirmed time. A personal invitation token additionally reveals its intended participant label.

Requests expire after 30 days and are removed by the daily cleanup route. Browser sessions expire after 30 days. Google Calendar write access is not requested. A separate planner-only endpoint can send RSVP invitations through Gmail SMTP; agent finalization never invokes it. Demo meetings remain private to their creating browser and use clearly labeled sample calendars.

## Agent workflow

Start at `/agents`, `/llms.txt`, or `/api/agent`. The versioned API contract is `/api/openapi`. New agents should use `/api/v1/meetings`, not the legacy browser API.

- `POST /api/v1/meetings`: create a named participant roster. The client generates and saves a unique random 32-byte base64url Bearer key before sending; `Idempotency-Key` makes retries recoverable. One key is scoped to one meeting. Reusing the same keys with changed input returns 409. Retry records last for the meeting's 30-day retention period.
- `GET /api/v1/meetings/:id`: status, exact missing participants, capture timestamps, private invitation links, and a recommended next action. No cookies required.
- `GET /api/v1/meetings/:id/slots`: paginated exact-duration, future-only slots after everyone responds, with explicit local/UTC times and a revision.
- `POST /api/v1/meetings/:id/finalize`: confirm a returned slot ID with its revision. Conditional updates reject stale responses. Identical retries are safe. No Google event or notification is created.

Personal invitation links bind a verified Google identity to a roster position after that person connects their calendar. They are private claim capabilities, not email identity verification. The organizer sees the actual Google display name. One account cannot fill multiple positions. Withdrawing availability releases that position and clears any confirmed time. Availability remains a snapshot, not live calendar synchronization.

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
