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

## Invitation delivery and retries

Run `scripts/migrate.mjs` before deploying this change. The additive migration preserves historical accepted sends and marks historical uncertain SMTP attempts for review; it never blindly resends them. Meeting/recipient payloads and calendar UIDs stay immutable. Existing “review” rows still require inspection; switching providers does not make their old SMTP outcomes safe to replay.

Gmail remains the default (`INVITATION_PROVIDER=gmail`, `INVITATION_FROM`, `GMAIL_APP_PASSWORD`). Explicit SMTP 4xx rejections and pre-submission connection failures retry with bounded exponential backoff. Authentication/5xx rejections stop with actionable errors. An interrupted SMTP DATA submission may already have reached the provider and remains unconfirmed to avoid duplicates. SMTP acceptance is not recipient delivery or inbox placement. `npm run email:verify` still checks the Gmail connection without sending.

For duplicate-protected retries and delivery/bounce confirmation, configure `INVITATION_PROVIDER=resend`, `INVITATION_FROM=meetings@wharfmeetings.com`, and a private sending-only `RESEND_API_KEY` after verifying the domain in Resend. This path uses Resend’s HTTP API, not SMTP. The immutable job ID supplies a stable idempotency key and an invitation correlation tag; payloads do not change across retries. Requests stop retrying at eight attempts or before the provider’s 24-hour key retention ends (a conservative 23-hour window is used). Sender/provider changes never silently rewrite old queued requests. Existing Gmail credentials are not migrated or committed.

### Background processing (required for automatic retries)

`GET /api/invitations/dispatch` requires `Authorization: Bearer CRON_SECRET` and processes four ready invitations per invocation. Jobs use database leases, row locks and attempt tokens so concurrent/stale workers cannot overwrite newer results. Browser draining remains available; scheduled processing works with every browser closed.

The included GitHub Actions workflow runs every five minutes **only after configuration**. Set repository secrets `WHARF_DELIVERY_WORKER_URL=https://YOUR_DOMAIN/api/invitations/dispatch` and `WHARF_DELIVERY_CRON_SECRET` to the same secret as the deployed `CRON_SECRET`. Set repository variable `WHARF_DELIVERY_ENABLED=true` after deploying and migrating, then manually run “Retry invitation delivery” to verify it. GitHub schedules may be delayed and are not a real-time delivery SLA. Higher volume requires more worker invocations or a dedicated queue service. Alternatively schedule the protected endpoint using your hosting provider; the existing Vercel daily cleanup schedule is unchanged. No scheduler, production secrets or production database has been configured by this PR.

### Delivery events (Resend)

Register `https://YOUR_DOMAIN/api/webhooks/resend` for `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.failed`, `email.suppressed`, and `email.complained`; store its signing secret in server-only `RESEND_WEBHOOK_SECRET`. Raw-body Svix signature/timestamp checks reject forged or stale callbacks. Immutable invitation tags handle events arriving before the send acknowledgement is saved. Timestamp checks, transition guards and conditional updates prevent duplicate or out-of-order events from downgrading a final state. Delayed events are not resent by Wharf because the provider is already handling delivery. Bounces, suppressions and complaints do not cause automatic resends.

The UI distinguishes queued/sending/retrying, provider-accepted, delivered-to-recipient-mail-server, delayed, failed/bounced, and unconfirmed statuses. Only the planner sees per-attendee names and sanitized failure reasons; emails and raw provider responses are not exposed. Delivery to a mail server does not prove inbox placement or calendar acceptance. Rescheduling, cancellation messages and RSVP tracking remain outside this feature. Agent finalization never invokes sending automatically.

Tests include embedded PostgreSQL (PGlite) execution of the production claim/recovery/fencing queries, signed/tampered callback verification, idempotency replay, failure classification and status wording. They do not contact SMTP/Resend or run migrations on production. Before launch, validate real provider responses/webhooks and cross-client calendar rendering in a staging environment.

## Browser planner finalization

The planner joins with Google, selects a valid time, and uses Create meeting. `POST /api/requests/:id/finalize` validates the browser’s availability revision, freezes the selected time and attendees, atomically queues the planner and attendee email recipients, and dispatches invitations through the configured provider. It uses a separate contract from `/api/v1/meetings/:id/finalize`, which only confirms an agent meeting without sending. `scripts/verify-finalization.mjs` verifies the browser transaction, outbox idempotency and frozen-attendee behavior using synthetic data without sending email.

Planners can permanently delete meetings from Pending meetings or the meeting page. The planner-only `DELETE /api/requests/:id` removes the meeting and its saved availability; previously sent calendar invitations are not cancelled. Idempotency recovery ends when a meeting is deliberately deleted or expires.
