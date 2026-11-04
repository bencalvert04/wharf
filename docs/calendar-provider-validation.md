# Calendar provider staging validation

## Latest Apple onboarding change

The user requested official Sign in with Apple instead of password entry. The replacement implementation removes the password form and rejects old iCloud password submissions. The Apple login button requires developer registration and stays disabled until configured. See [Apple sign-in setup](apple-signin.md). Historical iCloud connection instructions below are superseded and must not be used.

## November 4 Microsoft staging update

The staging Microsoft callback and separate 180-day secret were configured with explicit user approval. The secret expires May 3, 2027 and is saved only as a hidden secret in the separate staging Vercel project. The original app secret, production settings, and stable staging vault key were preserved. Redeployment reached READY and the provider endpoint reports Microsoft enabled. See [the setup and evidence record](microsoft-staging.md).

Live personal Outlook **permission denial passed** for meeting `4a3ede77-7b19-4ae6-a66f-eceb9e7e0987`, with no credential or attendee inserted. Consent with the default `Calendars.ReadBasic` completed token exchange and encrypted storage, but calendarView returned HTTP 403 `ErrorAccessDenied`, including after refresh. No false free snapshot was inserted.

After explicit user approval, the isolated staging experiment with `Calendars.Read` succeeded. Actual calendar reads passed exact UTC assertions for spring/fall DST, daily recurrence, moved and deleted occurrences, all-day busy blocking within meeting hours, Free exclusion, and tentative/out-of-office blocking. Saved reuse, second-meeting creation, sign-out/in, removal/rejoin, local disconnect, clean reconnect, and a two-tab sign-out invalidating a pending callback also passed. These results apply to the broader staging read scope only. Cross-provider switches, separate-session races, provider-side revocation, pagination at live scale, and invitation receipt/RSVP remain untested.

An automatic clipboard write was found to stall create-and-connect. A bounded wait and regression test fixed it, and subsequent hosted create-and-connect flows passed. All **238 automated tests**, TypeScript, and the hosted build pass. Source commit `32ef3a8` is deployed as `dpl_96GqbtxWED8WMzCXLWpbgGjCAHsV` with Vercel Authentication retained. See the detailed setup record for account, meeting IDs, and capture timestamps.

## November 4 follow-up: Google and invitation readiness

On commit `551919c`, the targeted Google and invitation regression suite passed **42/42 tests** with application credentials removed. It covers combined Google start/callback and scope upgrade, stale provider callbacks, native Google event recovery, invitation encoding, and atomic email finalization/duplicate queue protection. These remain synthetic tests, not live Google consent, invitation receipt, or RSVP evidence. Log: `/tmp/wharf-google-invitation-regression-20261104.log`.

Staging meeting `42395564-2050-4cbe-ab3c-f7b25c039780` was used for the real hosted missing-sender check: the Outlook planner selected a valid future slot and attempted Create meeting. Read-only Neon assertions confirmed `final_time IS NULL` and zero invitation jobs afterward. No message was sent. The environment still lacks `INVITATION_FROM` and `GMAIL_APP_PASSWORD`; configure the staging sender before repeating receipt/RSVP tests. Use `wharf.calendar.test2026@outlook.com` as the disposable recipient, with the user explicitly requesting invitation testing.

No Google OAuth credentials were found in the local worktrees or existing staging configuration. Google Cloud setup was opened for project `root-engine-512707-n9`; the owner account `bencalvert04@gmail.com` requires passkey verification. The user was asked to complete that sign-in directly and to sign into the sender account or identify its existing secure credential location. No Google client, callback, grant, or sender credential was changed. Production remains unchanged.

After owner sign-in, create a separate staging Web OAuth client, register exactly `https://wharf-calendar-staging.vercel.app/api/auth/google/callback`, and securely configure only the staging project's `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Preserve the production OAuth client and audience. Use the existing stable staging vault key. Redeploy staging after configuration. Complete identity-only login, attendee free/busy, planner owned-event consent and saved-token upgrade, denial, account switching, and native event receipt/RSVP. For the Outlook planner, finalize through the email outbox, verify the actual dummy inbox and calendar, retry the same confirmation, and compare received count and stable UID against the outbox.

Apple's support mailbox check found only the case acknowledgment and no eligibility decision. The official iCloud OAuth pilot remains separate from Sign in with Apple identity; see [Apple follow-up](apple-signin.md).

## Historical reconciliation status, November 2, 2026

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
- At initial setup, iCloud password entry was available and OAuth/sender settings were absent. This is historical: password entry is now disabled, and the dedicated personal Outlook account and Microsoft staging configuration were completed on November 4. Google, Apple identity, and the invitation sender remain unconfigured.
- Existing Vercel preview/development configurations shared production's database, so those were not reused. GitHub CI and recovered old logs supplied mocked/synthetic validation, not a confirmed isolated staging site or real provider validation.
- Source: branch `codex/calendar-staging`, derived from the reconciled commit above. Neither PR #11 nor main has been merged or pushed by this staging setup. The live Wharf project is unchanged.

### Hosted infrastructure verification

Deployment `dpl_7fo9FwEDnRBVSdFAAQpRdHD9MJbM` reached READY on November 2, 2026. The browser displayed the test-site banner. Anonymous requests to both `/` and `/api/auth/calendar/providers` redirect to Vercel authentication. An authorized provider request returns `google:false`, `microsoft:false`, `icloud:true`.

At `2026-11-02T22:15:40Z`, an authenticated staging smoke check created meeting `b7f2be4b-df79-4735-b4cf-13b9b2ab7ad5` with HTTP 201, read it as its planner with HTTP 200, and found it in pending meetings. Invalid-format iCloud credentials returned HTTP 400, unconfigured Microsoft returned HTTP 503, and a cross-origin meeting creation returned HTTP 403. No real provider credentials were used. Database inspection afterward showed one synthetic meeting, zero attendees, zero provider connections, and zero invitation jobs. This verifies hosted plumbing and error handling, not real iCloud authentication or calendar reads.

The staging build and TypeScript check pass. The earlier reconciled source passed all 226 automated tests. The production project still points at deployment `dpl_4uTXAdq2Jf1fGXYovRi1Fi8v2KDL`; staging points at its own deployment above.

Historical iCloud password instructions are superseded. Do not enter Apple credentials into Wharf. Official Sign in with Apple identity setup is waiting on developer eligibility/configuration, and does not itself authorize iCloud calendar reads.

## Needed to continue live validation

- A resolution for personal Outlook's default ReadBasic failure before treating that path as release-ready. The broader read experiment is restricted to staging. BYU administrator approval remains a separate organizational-account prerequisite.
- Staging Google OAuth configuration and a consenting Google regression account. Apple developer eligibility/configuration and a supported official calendar authorization path remain unresolved; Sign in with Apple alone is identity-only.
- An approved staging invitation sender and recipient addresses, with mailbox/calendar access to verify receipt, RSVP, and duplicate prevention. No delivery test has been completed.

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

The table below is the acceptance checklist, not a blanket PASS. Completed personal Outlook checks are recorded above and in the detailed evidence record; all other provider and delivery cases remain NOT RUN. Record the account alias, environment, tested commit, timestamp, expected/actual behavior, and evidence before changing a result to PASS. Run the account lifecycle cases separately for each available provider. Microsoft 365/BYU is additional coverage, not a substitute for personal Outlook. Historical iCloud password cases are not actionable while calendar access remains disabled.

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
