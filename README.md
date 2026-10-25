# Wharf on Vercel

Standard Next.js app, prepared from the existing Wharf Sites project. The UI, anchor logo, single-day option, and scheduling engine are preserved. Cloudflare Workers, D1, and Sites authentication dependencies have been removed.

## Deploy
1. Deploy this directory as a Next.js project in the intended Vercel account.
2. Connect a Neon Postgres database through Vercel Storage and provide DATABASE_URL to the project.
3. Run `npm run db:migrate` with that database's DATABASE_URL in the environment.
4. Redeploy and verify request creation and retrieval.

Use Vercel deployment protection if the preview should remain account-private. The app uses HttpOnly sessions and planner capability keys. Invitation URLs expose meeting constraints, while attendee names and aggregate results require planner or joined-attendee authorization.

## Local development
Node 22.13 or later is required. Run `npm ci`, set DATABASE_URL in `.env.local`, then `npm run dev`. For the migration script, export DATABASE_URL or use `node --env-file=.env.local scripts/migrate.mjs`.

`npm test` checks scheduling logic. `npm run build` verifies the production build.

## Status
Google Calendar joining is implemented. Calendar invitations are sent when the planner creates the meeting. Sample calendars are clearly labeled. No existing D1 meeting records have been migrated. The original Sites deployment remains intact.

## Google Calendar

Implemented: server OAuth code flow with PKCE, one-use session-bound state and nonce verification; primary-calendar free/busy snapshots; planner/member result authorization; snapshot removal; 30-day expiry and daily database cleanup. No Google tokens are persisted. API consumers retain the returned plannerKey and use it as a bearer token to read results.

Production configuration: `APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, `CRON_SECRET`. Register `APP_URL/api/auth/google/callback` with Google. Google OAuth was published to Production on October 25, 2026. Users can authorize their own profile and free/busy access. The owner chose to perform the first live calendar grant personally; no live calendar snapshot has been verified yet. Preview deployments must not use the production callback credentials.

Tests: `npm test`; `npm run build`. `scripts/verify-calendar.mjs` exercises a local server at port 3002 using synthetic rows in the configured database, then removes those rows. It verifies result permissions, privacy, CSRF, leaving, OAuth session binding, and replay prevention. Google consent and a live free/busy response still require an actual Google user sign-in.

## Pending meetings

The Pending meetings tab lists unexpired, non-demo requests owned by the browser session or joined with its verified Google identity. A request stays pending until the planner creates the meeting and confirms a final time, even if its proposed dates have passed.

Pending meeting cards show the planner name, joined attendee names, and proposed date range, and link to the existing shared-availability calendar. Run `npm run db:migrate` before using the updated creation/Google callback routes to add the nullable `requests.planner_name` column. The planner name is saved when they connect Google, or inferred from an existing connected attendee identity on creation. Existing unnamed planners display a fallback. No migration has been run against a remote database as part of this local change.

## Calendar invitations

Wharf sends RSVP calendar requests through Gmail SMTP as `Wharf <wharfmeetings@gmail.com>`. It never requests calendar-write access from attendees. Set `INVITATION_FROM=wharfmeetings@gmail.com` and `GMAIL_APP_PASSWORD` in the server environment. Keep the App Password out of Git and chat. Enable 2-Step Verification and create an App Password called Wharf in the sender Google account. Run `npm run email:verify` locally to check authentication without sending an email. Production needs the same environment variables.

Run `npm run db:migrate` for the verified attendee email, optional final-time field, and durable invitation outbox. Existing attendees must reconnect Google to grant email identity access. Their verified email is stored privately and never returned by meeting-list APIs.

The planner selects a time from Valid times or the calendar, then chooses Create meeting. They must join with their Google calendar first, so their availability and invitation are included. `POST /api/requests/:id/finalize` accepts `{start,end,revision}` (epoch milliseconds and the revision from GET). It verifies the owner session, future exact-duration shared availability, verified recipient emails, and unchanged attendees. A database transaction commits the confirmed time and invitation outbox together; an attendee trigger serializes joins and removals with finalization. Repeating the same confirmation is safe. Different times are rejected once confirmed.

The browser dispatches queued invitations in batches. If interrupted, the planner can use Send remaining invitations on the confirmed meeting. Only unattempted jobs are retried. This version does not implement rescheduling, cancellations, or RSVP tracking.

Gmail sends one private calendar request per recipient. Queue records prevent duplicate queuing. SMTP cannot guarantee exactly-once delivery after a network failure, so once a send has been attempted it is not retried automatically. Unconfirmed sends are flagged for manual review in Gmail Sent before any resend. Each dispatch processes up to four recipients concurrently; call again for remaining unattempted jobs. Accepted means Gmail accepted the message, not that the recipient received or accepted it. Invitation appearance depends on recipient calendar settings. No actual invitations have been sent or tested against Gmail yet.

Planners can permanently delete meetings from Pending meetings or the meeting page. The planner-only `DELETE /api/requests/:id` removes the meeting and its saved availability; previously sent calendar invitations are not cancelled.
