# Microsoft staging test

## Permission fix, November 4, 2026

The user requested resolving the remaining Outlook permission issue. The validated `Calendars.Read` scope is now the default request, rather than a staging-only experiment. Missing or limited returned scopes are rejected during both exchange and refresh. Existing ReadBasic-only users must reconnect and consent; no write permission or additional calendar fields were added. The old compatibility flag no longer affects behavior. Historical experiment records below are retained as evidence of the choice.

## Latest delivery result, November 4, 2026

The staging sender is now configured under the user's Gmail account with a hidden credential, and Google OAuth is active in staging. Hosted Outlook-planned finalization sent one email to each of two Google/Outlook attendees, with one SMTP attempt per recipient. The Outlook recipient accepted through native RSVP controls and the organizer received a matching calendar reply. Native Google-planned delivery and a declined Outlook RSVP also passed separately. See [the current live acceptance record](calendar-provider-validation.md) for timestamps, message IDs, normal-refresh duplicate checks, and remaining gaps. Earlier unconfigured-sender statements below describe the initial setup only.

## Current setup, November 4, 2026

The user completed signup directly. Browser inspection confirmed a provisioned inbox and calendar for the dedicated test account `wharf.calendar.test2026@outlook.com`. No password is stored in this repository.

The Entra portal was verified while signed in as the Microsoft account `wharfmeetings@gmail.com`. The application is Wharf, client ID `1f104508-0140-443d-bcd7-8c1874c2ead6`, tenant `d39181f6-e830-4ed6-8e64-b4861e5a21f9`, registration object `9fe929b0-6112-4776-9332-b19af69eed1f`. It supports organizational directories and personal Microsoft accounts. Delegated `User.Read`, `Calendars.ReadBasic`, and `offline_access` were verified. No write permission was added.

With the user's explicit approval, the exact Web callback `https://wharf-calendar-staging.vercel.app/api/auth/microsoft/callback` was added. The existing production and localhost callbacks were preserved. A separate credential named `Wharf isolated staging 2026-11-04` was created with the portal's recommended 180-day lifetime, expiring **May 3, 2027**. Its value was transferred directly into the staging Vercel secret field, without writing it to the repository or logs. The existing credential expiring April 27, 2027 was preserved.

`MICROSOFT_CLIENT_ID` and hidden `MICROSOFT_CLIENT_SECRET` are configured in the **Production environment of the separate staging project** `prj_TCxNuo3KWBnZxdyR0CmqVZ75b08n`. Existing `APP_URL`, staging database, and vault key were retained. Redeployment `GeycEYqfFTiT8FSKpuUFs4i9id43` reached READY at `https://wharf-calendar-staging-1cfy08ump-wharf1.vercel.app` and was aliased to the staging URL. An authenticated provider check returned `microsoft:true`, with Google, iCloud, and Apple false. This initial deployment established configuration; subsequent live calendar-read evidence is recorded below. The actual production Wharf project was not changed.

Read-only checks confirmed the staging provider state/connection and Apple state/account tables, connection-generation and calendar-intent columns, the approved local staging URL/database host, and the existing local vault key's 64-hex format. The remote staging vault key is present as a sensitive variable. Neither local nor remote vault keys were changed. Vercel team membership lists only Ben as owner, with no separate Ray member. The staging project link and access status were sent to Ray at the user's request: `https://vercel.com/wharf1/wharf-calendar-staging`.

Invitation delivery remains blocked on the separate staging sender setup. Google regression and Apple identity setup remain unconfigured. Sign in with Apple does not grant iCloud calendar access, and the password-based iCloud connection was removed at the user's request.

### First live authorization checks

On November 4, staging meeting `4a3ede77-7b19-4ae6-a66f-eceb9e7e0987` was created for March 12 through 16, 2027, 09:00 to 17:00 America/Denver, 30-minute slots. Microsoft presented the dedicated personal account and requested profile, basic calendar read, and ongoing access. **Denial passed**: clicking Deny returned to the same meeting with `calendar=cancelled` and the visible cancellation message. Read-only staging database checks confirmed zero provider connections and zero attendees at that point.

The user then explicitly approved test-account access. Code exchange and profile retrieval succeeded; Wharf stored an encrypted Microsoft connection and displayed the correct signed-in account. Calendar reads failed, leaving zero attendees rather than an empty/free snapshot. Retrying saved access refreshed the credential but again failed at Graph. Redacted staging diagnostics at `2026-11-04T08:14:34.277Z` confirmed HTTP **403 ErrorAccessDenied** from calendarView. This is distinct from BYU tenant approval and does not establish a successful calendar read.

Microsoft's [calendarView documentation](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0) lists `Calendars.ReadBasic` for personal accounts. A [firsthand October reproduction](https://learn.microsoft.com/en-my/answers/questions/6021667/personal-microsoft-account-gets-403-for-get-me-cal) reports the same denial and success with `Calendars.Read`. That is evidence for a compatibility experiment, not official confirmation of the cause. The experimental flag `MICROSOFT_STAGING_READ_COMPATIBILITY=true` requests `Calendars.Read` only when `WHARF_ENVIRONMENT=staging`; production still requests ReadBasic. The test-account owner explicitly approved this broader read-only access on November 4. Calendar requests continue selecting only start/end/showAs/isCancelled. No write scope is requested. The successful broader-scope reads below do not resolve the default ReadBasic failure. Remove the experimental flag to restore the baseline request; previously granted provider-side access must be revoked separately.

The flag is configured only on `wharf-calendar-staging`. Commit `32ef3a8` is deployed as `dpl_96GqbtxWED8WMzCXLWpbgGjCAHsV` and reached READY with Vercel Authentication retained. All 238 automated tests pass, including rejection of this compatibility flag outside staging and rejection of a token lacking the requested read scope. TypeScript and the hosted build pass.

### Live read success with approved broader read permission

The user explicitly approved `Calendars.Read` for the dummy account on November 4. At `2026-11-04T08:21:12.103Z`, the callback returned `calendar=joined` and saved one attendee for the spring meeting. Read-only database assertions matched all five recurrence instances exactly: March 12/13 at 16:00 to 16:30 UTC and March 14/15/16 at 15:00 to 15:30 UTC. The March 15 all-day busy event was clipped to the meeting's 15:00 to 23:00 UTC working hours, and the March 12 Free event contributed no busy interval. The browser showed 09:30 to 17:00 availability on four days and none on March 15. This validates actual Graph calendarView reads, recurrence expansion, spring DST, all-day blocking within working hours, and Free exclusion under the broader staging scope. It does not validate the default ReadBasic scope, which failed above.

The same signed-in account created and joined a second meeting, `0f9a02bc-74f6-4aef-a7d0-c56235896c91` (Wharf Outlook saved access check), using saved credentials without another Microsoft login. The create-and-connect flow completed, providing hosted verification of the clipboard timeout fix. Sign-out then displayed Log in while preserving one encrypted provider grant and both meeting snapshots, as intended. Signing in again restored the correct account and existing meeting membership without another consent grant. Removing availability deleted only the second meeting's attendee; Rejoin restored all six expected busy intervals from a fresh read at `2026-11-04T08:25:43.447Z`.

Disconnect removed the stored credential while retaining both existing snapshots. For the concurrent-tab test, the second meeting's attendance was removed, a reconnect was started, and the database confirmed one live pending state. Signing out through a second tab removed that state. Completing the old Microsoft login returned `calendar=expired`, left the browser signed out, and did not restore a credential or second-meeting snapshot. The check confirmed zero active pending states and zero credentials. This validates this specific live sign-out/callback race; cross-provider and multi-session interleavings remain untested. A fresh reconnect subsequently restored exactly one encrypted grant and the second meeting attendee successfully.

### Fall DST, recurrence exceptions, and availability status

Meeting `42395564-2050-4cbe-ab3c-f7b25c039780` covers November 5 through 9, 2027, 09:00 to 17:00 America/Denver. Its initial snapshot at `2026-11-04T08:32:20.716Z` matched five 09:00 to 09:30 local occurrences: November 5/6 at 15:00 UTC and November 7/8/9 at 16:00 UTC.

The November 8 occurrence was moved to 11:00 to 11:30 local, and only the November 9 occurrence was deleted in Outlook. Removing and rejoining the Wharf meeting produced a fresh snapshot at `2026-11-04T08:37:08.124Z`. Exact database assertions confirmed November 5/6 at 15:00 to 15:30 UTC, November 7 at 16:00 to 16:30 UTC, and November 8 at 18:00 to 18:30 UTC. Neither the old November 8 time nor November 9 remained. The UI showed the moved gap on Monday and the fully available Tuesday.

The November 5 occurrence was then changed to Tentative and November 6 to Out of office. Outlook's month view confirmed both saved statuses. Another remove/rejoin at `2026-11-04T08:38:54.185Z` retained exactly those four expected intervals, proving both statuses block time. These checks use explicit removal and rejoin to obtain a fresh snapshot; ordinary website finalization still uses saved snapshots and does not automatically refresh calendars.

The initial create-and-connect action exposed an unrelated clipboard stall before authorization. The clipboard helper now limits waiting to 1.5 seconds after the created invite URL is available, with the existing manual Copy invite link fallback. A regression test covers an indefinitely pending clipboard write and late completion. The subsequent successful hosted create-and-connect flows verified the fix. Current deployment and 238-test results are recorded above.

## Calendar fixtures and current test-account state

The spring series, all-day busy event, and free event were created directly through Outlook's UI in the dedicated account's primary calendar. The event timezone was verified as Mountain Time (US & Canada). Month view confirmed five daily 09:00 to 09:30 busy occurrences from March 12 through 16, an all-day busy event on March 15, and a 13:00 to 14:00 free event on March 12. No attendees were added and no invitations were sent. Outlook initially defaulted the all-day item to Free; it was explicitly changed to Busy before saving. The fall series was also created directly on November 4 and then modified as recorded above. Actual Graph reads were validated separately against these fixtures.

[outlook-staging.ics](fixtures/outlook-staging.ics) remains an alternative for a fresh test calendar. **Do not import it into this account now**, because both seasonal series already exist and import could duplicate them. For a fresh account, import once into its **primary calendar**, with Outlook's calendar timezone set to America/Denver (Mountain Time). The implementation queries `/me/calendarView`, so a secondary calendar is not suitable for this test. The file has no attendees or organizer and sends no invitations. File parsing was checked locally, but Outlook import has not been tested. Inspect the resulting recurrence, all-day status, and Show As values before using imported items as expected provider data.

| Test | Expected busy time |
| --- | --- |
| Spring recurring event | March 12 and 13, 2027: 16:00 to 16:30 UTC. March 14 through 16: 15:00 to 15:30 UTC. Each is 09:00 to 09:30 Denver time. |
| All-day busy | March 15 local midnight through March 16 local midnight, exclusive end. With Denver timezone, 06:00 UTC to 06:00 UTC. It overlaps that day's recurring occurrence. |
| Free event | March 12, 2027, 13:00 to 14:00 Denver time. Must not block availability. |
| Fall recurring event | November 5 and 6, 2027: 15:00 to 15:30 UTC. November 7 through 9: 16:00 to 16:30 UTC. Each is 09:00 to 09:30 Denver time. |

Use separate meeting windows for March 12 through 16 and November 5 through 9, including weekends and 09:00 to 17:00 Denver time. Both DST transitions, moved/deleted occurrences, and tentative/out-of-office blocking passed in the live test above. The table describes the original fixture; the active fall calendar now has the recorded exceptions. No invitations were sent by fixture preparation.

Run connection, denial, saved reuse, sign-out/in, disconnect/reconnect, concurrent-tab, and invitation checks from [the acceptance record](calendar-provider-validation.md). Record actual results before marking any row passed. Microsoft 365/BYU admin approval remains separate from personal Outlook testing.
