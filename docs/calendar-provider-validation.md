# Calendar provider staging validation

## Status as of November 2, 2026

PR #11 remains draft and unfinished. Reconciliation starts at provider commit `09f8f39` and main `eda55cd`. Main's merged Google approval flow (PR #14), refresh-token scope upgrade, and privacy disclosures are retained. No hosting configuration, remote database migration, real-account authorization, email invitation, or deployment has been performed in this reconciliation.

The original main checkout was clean and remains untouched. Work is isolated on `codex/calendar-providers-reconcile` in a separate worktree. Ray's `/Users/rayshaw/Documents/ChatGPT/wharf-pending-reentry` environment is unavailable on this machine. No local provider/database/sender configuration was found in the main checkout. The prior successful secret check and migrated Neon test database do not establish this environment's readiness.

## Local validation completed

- All 226 automated tests pass with application credentials removed from the test environment. Provider transport is mocked and database tests use isolated PGlite.
- Production build and TypeScript check pass without live provider/database/sender configuration.
- The new Google callback regression fails against the old unguarded handle and passes after the fix: a newer cross-session action prevents stale provider-connection deletion even before the provider generation changes.
- Combined Google start/callback tests cover planner scope selection, partial consent, saved-token scope upgrades, saved joins, header login, and provider-switch protection.
- The offline staging checker is covered with synthetic configuration. It has not validated an actual staging credential file.

## Needed to continue live validation

- Approved isolated staging origin and database hostname, with credentials available through a private local env file or the hosting platform's secure configuration.
- The existing staging vault key, or confirmation that the target is a new empty environment before creating its first key. Never replace or copy the production key.
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
- PGlite and mocked transport tests do not validate Neon multi-process lock contention, consent screens, actual calendar reads, email receipt, or RSVP. Keep the PR draft and undeployed until the live evidence is complete.
