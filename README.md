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
Google Calendar joining is implemented. Email notifications are not implemented. Sample calendars are clearly labeled. No existing D1 meeting records have been migrated. The original Sites deployment remains intact.

## Google Calendar

Implemented: server OAuth code flow with PKCE, one-use session-bound state and nonce verification; primary-calendar free/busy snapshots; planner/member result authorization; snapshot removal; 30-day expiry and daily database cleanup. No Google tokens are persisted. API consumers retain the returned plannerKey and use it as a bearer token to read results.

Production configuration: `APP_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, `CRON_SECRET`. Register `APP_URL/api/auth/google/callback` with Google. Google OAuth was published to Production on October 25, 2026. Users can authorize their own profile and free/busy access. The owner chose to perform the first live calendar grant personally; no live calendar snapshot has been verified yet. Preview deployments must not use the production callback credentials.

Tests: `npm test`; `npm run build`. `scripts/verify-calendar.mjs` exercises a local server at port 3002 using synthetic rows in the configured database, then removes those rows. It verifies result permissions, privacy, CSRF, leaving, OAuth session binding, and replay prevention. Google consent and a live free/busy response still require an actual Google user sign-in.

## Pending meetings (local implementation)

The Pending meetings tab lists unexpired, non-demo requests owned by the browser session or joined with its verified Google identity. A request stays pending until a final time is selected, even if its proposed dates have passed. There is no separate status control. The list currently reads an optional `requests.final_time` field through `to_jsonb`, so no schema change is required on the current database. Ben's planner final-time feature is not yet on `main`; align this one field mapping with that feature's actual storage contract when integrating it. Until that feature exists, all accessible non-demo requests without a final time remain pending.

Pending meeting cards show the planner name, joined attendee names, and proposed date range, and link to the existing shared-availability calendar. Run `npm run db:migrate` before using the updated creation/Google callback routes to add the nullable `requests.planner_name` column. The planner name is saved when they connect Google, or inferred from an existing connected attendee identity on creation. Existing unnamed planners display a fallback. No migration has been run against a remote database as part of this local change.
