# Calendar provider staging validation

## Latest Apple onboarding change

The user requested official Sign in with Apple instead of password entry. The replacement implementation removes the password form and rejects old iCloud password submissions. The Apple login button requires developer registration and stays disabled until configured. See [Apple sign-in setup](apple-signin.md). Historical iCloud connection instructions below are superseded and must not be used.

## Status as of November 2, 2026

PR #11 remains draft and unfinished. Reconciliation starts at provider commit `09f8f39` and main `eda55cd`. Main's merged Google approval flow (PR #14), refresh-token scope upgrade, and privacy disclosures are retained. The reconciliation is committed locally as `d2b549c`. A separate staging environment was subsequently created at the user's request; see the setup record below. No real-account calendar authorization or email invitation has been completed.

The original main checkout was clean and remains untouched. Work is isolated on `codex/calendar-providers-reconcile` in a separate worktree. Ray's `/Users/rayshaw/Documents/ChatGPT/wharf-pending-reentry` environment is unavailable on this machine. No local provider/database/sender configuration was found in the main checkout. The prior successful secret check and migrated Neon test database do not establish this environment's readiness.

## Local validation completed

- All 226 automated tests pass with application credentials removed from the test environment. Provider transport is mocked and database tests use isolated PGlite.
- Production build and TypeScript check pass without live provider/database/sender configuration.
- The new Google callback regression fails against the old unguarded handle and passes after the fix: a newer cross-session action prevents stale provider-connection deletion even before the provider generation changes.
- Combined Google start/callback tests cover planner scope selection, partial consent, saved-token scope upgrades, saved joins, header login, and provider-switch protection.
- The offline staging checker is covered with synthetic configuration. Its complete-provider check will remain incomplete until Google, Microsoft, and the invitation sender are configured.

## Isolated staging setup, November 2, 2026

- Site: `https://wharf-calendar-staging.vercel.app`, separate Vercel project `wharf-calendar-staging` in team `wharf1`. Project ID: `prj_TCxNuo3KWBnZxdyR0CmqVZ75b08n`.
- Vercel Authentication protects all staging domains and deployments. Sign in with the Vercel account that has access to team `wharf1`.
- Database: new Neon Free resource `wharf-calendar-staging-db`, resource ID `store_UHe3XRj961WhaVxl`, Neon project `shy-star-51064407`. Connected only to the staging Vercel project.
- Database host: `ep-divine-dream-bc9upssq-pooler.c-16.us-east-1.aws.neon.tech`. Verified zero public tables before migration. All additive migrations completed successfully before deployment.
- A new independent vault key and cleanup secret were generated for this empty environment and stored in sensitive staging environment variables. Keep this vault key stable. Production credentials and data were not copied.
- Private local configuration is in ignored, owner-readable `.env.staging.local` in the `wharf-staging` worktree. The remote environment pull contains placeholders for sensitive variables and is not a runnable replacement for that file.
- `APP_URL` is the staging origin above and `WHARF_ENVIRONMENT=staging` displays a test-site banner and noindex metadata. Staging build verified both.
- iCloud is configured for account-owner connection. No account credentials have been entered yet. Microsoft and Google OAuth and the invitation sender are intentionally unconfigured. The user has an iCloud calendar but no Outlook account.
- Existing Vercel preview/development configurations shared production's database, so those were not reused. GitHub CI and recovered old logs supplied mocked/synthetic validation, not a confirmed isolated staging site or real provider validation.
- Source: branch `codex/calendar-staging`, derived from the reconciled commit above. Neither PR #11 nor main has been merged or pushed by this staging setup. The live Wharf project is unchanged.

### Hosted infrastructure verification

Deployment `dpl_7fo9FwEDnRBVSdFAAQpRdHD9MJbM` reached READY on November 2, 2026. The browser displayed the test-site banner. Anonymous requests to both `/` and `/api/auth/calendar/providers` redirect to Vercel authentication. An authorized provider request returns `google:false`, `microsoft:false`, `icloud:true`.

At `2026-11-02T22:15:40Z`, an authenticated staging smoke check created meeting `b7f2be4b-df79-4735-b4cf-13b9b2ab7ad5` with HTTP 201, read it as its planner with HTTP 200, and found it in pending meetings. Invalid-format iCloud credentials returned HTTP 400, unconfigured Microsoft returned HTTP 503, and a cross-origin meeting creation returned HTTP 403. No real provider credentials were used. Database inspection afterward showed one synthetic meeting, zero attendees, zero provider connections, and zero invitation jobs. This verifies hosted plumbing and error handling, not real iCloud authentication or calendar reads.

The staging build and TypeScript check pass. The earlier reconciled source passed all 226 automated tests. The production project still points at deployment `dpl_4uTXAdq2Jf1fGXYovRi1Fi8v2KDL`; staging points at its own deployment above.

For iCloud, the account owner generates an Apple app-specific password under Apple Account > Sign-In and Security > App-Specific Passwords, then enters it directly into the staging site's iCloud form. Never put it in chat or this record. This uses CalDAV, not Sign in with Apple. An account with two-factor authentication is required.

## Needed to continue live validation

- Microsoft registration access to verify the secret expiration, supported account types, delegated permissions, and exact Web callbacks. The supplied public client ID is `1f104508-0140-443d-bcd7-8c1874c2ead6`.
- Consenting personal Outlook and iCloud test accounts, plus a Google regression account. The account owner completes sign-in and MFA. iCloud uses an app-specific password, never the normal Apple password.
- An approved staging invitation sender and recipient addresses, with mailbox/calendar access to verify receipt and RSVP. BYU administrator approval remains a separate organizational-account prerequisite.

Keep secrets out of this record, screenshots, shell arguments, logs, commits, and PRs. Evidence may record test-account aliases, meeting identifiers, timestamps, provider results, invitation UID/message IDs, and redacted screenshots.

## Prepare the chosen environment

Create the private staging file through the approved secure configuration path, outside tracked files or as ignored `.env.staging.local`, with mode `600`. Set `DATABASE_URL`, `APP_URL`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INVITATION_FROM`, and `GMAIL_APP_PASSWORD`. Google credentials are needed for the regression test. Do not copy production user data or invitation jobs. Confirm the database resource is staging-only using its owner/provider control plane; a hostname check alone cannot establish isolation.

Run the offline check using the approved origin and database hostname:

```sh
npm run staging:check -- --env-file .env.staging.local --expected-app-url http://localhost:3010 --expected-db-host APPROVED_STAGING_DB_HOST
```

This command reads only that file, ignores inherited application credentials, checks required configuration and target matching, and prints callback URLs without secrets. It does not authenticate, prove secret validity/expiration, migrate, send mail, modify the key, or deploy.

For `APP_URL=http://localhost:3010`, register these exact callbacks:

- Google: `http://localhost:3010/api/auth/google/callback`.
- Microsoft Web platform: `http://localhost:3010/api/auth/microsoft/callback`.

For hosted staging, use the approved HTTPS origin and the same callback paths. Preserve existing production callbacks. In Entra, verify personal and organizational accounts, delegated `User.Read`, `Calendars.ReadBasic`, and `offline_access`. A client-secret authentication check alone is not delegated calendar access. Inspect the configured secret's expiration through Entra without exposing its value.

Once the target has been identified and approved, apply additive migrations before running the new handlers:

```sh
env -u DATABASE_URL node --env-file=.env.staging.local scripts/migrate.mjs
```

This removes an inherited database URL so it cannot silently override the approved file. Record migration completion against the approved host. Keep old unguarded deployments away from this database. For a local server, start with an isolated environment:

```sh
env -i PATH="$PATH" HOME="$HOME" node --env-file=.env.staging.local node_modules/next/dist/bin/next dev -p 3010
```

Do not use `scripts/configure-vercel.mjs` for staging: it writes production configuration. Do not run the old `scripts/verify-calendar.mjs` as provider evidence: it uses synthetic Google records and a fixed past date.

## Live acceptance record

Every row below is **NOT RUN** in this reconciliation. Record the account alias, environment, tested commit, timestamp, expected/actual behavior, and evidence before changing a result to PASS. Run the account lifecycle cases separately for personal Outlook, iCloud, and Google. Microsoft 365/BYU is additional coverage, not a substitute for personal Outlook.

| Case | Required result |
| --- | --- |
| Connect and denial | Successful consent saves encrypted access and correct busy time. Declined consent or invalid/revoked Apple app password adds no availability and does not replace existing snapshots. |
| Rejoin and sign-out/in | Joining a second meeting reuses saved access. Sign-out leaves access saved but cancels pending callbacks for that session. Signing in again restores the correct identity and preserves invitation ownership. |
| Disconnect/reconnect | Local credentials disappear. Old callbacks cannot restore them. Reconnect creates a new generation. Verify provider-side revocation separately and reconnect after granting new access. |
| Concurrent actions | Delay one callback/read, then switch provider, disconnect, or sign out in another tab. The stale operation cannot replace the newer session, grant, or snapshot, or delete its connection. Repeat across two sessions for the same account. |
| Event interpretation | Compare known UTC and zoned timed events, recurring instances, moved/cancelled exceptions, transparent/free events, tentative/OOF events, all-day events, and both DST transitions against expected intervals. |
| Unsupported iCloud times | Floating or unrecognized-zone timed events return a read failure and preserve the previous snapshot. They must not silently mark the person free. |
| Mixed availability | Join one meeting with all three providers and verify the intersection against deliberately placed test events. Confirm participant views expose shared availability, not individual busy intervals. |
| External planner delivery | Outlook planner and iCloud planner each finalize a mixed-provider meeting. Every approved recipient receives one usable calendar invitation, accepts or declines it, and sees the correct local time. Record mailbox and calendar evidence. |
| Idempotent delivery | Repeat confirmation and refresh/retry after an interrupted response. Verify one outbox job per recipient and no duplicate received invitation. Ambiguous SMTP delivery must remain for review, not automatic resend. |
| Google regression | New attendee completes combined sign-in/free-busy consent; attendee has no event-write request. Planner can approve event scope, including with an existing refresh token, and sends one native Google event invitation. Partial permission denial retains correct behavior. |
| Provider outage | A failed read or later page cannot store an empty/free snapshot. Record the current snapshot-based finalization limitation below. |

## Limits retained for this release candidate

- Direct Slack attendance and organizer authorization remain Google-specific. Full cross-provider Slack booking requires separate implementation and validation; do not advertise it as supported.
- Website finalization checks saved snapshots. A failed refresh preserves the old snapshot and does not create a persistent booking block. This candidate does not guarantee a fresh read of every live calendar before booking. A future live-read booking design needs an explicit freshness policy and failure behavior.
- iCloud floating/unrecognized-zone timed events intentionally fail. Users must use supported calendar times; reconnecting alone does not fix those events.
- Microsoft/iCloud disconnect deletes local credentials. Users must also revoke consent or the app-specific password at the provider when they want provider-side revocation.
- PGlite and mocked transport tests do not validate Neon multi-process lock contention, consent screens, actual calendar reads, email receipt, or RSVP. Keep the PR draft and out of production until the live evidence is complete. The isolated staging deployment is for collecting that evidence.
