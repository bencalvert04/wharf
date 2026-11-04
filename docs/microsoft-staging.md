# Microsoft staging test

## Current setup, November 4, 2026

The user completed signup directly. Browser inspection confirmed a provisioned inbox and calendar for the dedicated test account `wharf.calendar.test2026@outlook.com`. No password is stored in this repository.

The Entra portal was verified while signed in as the Microsoft account `wharfmeetings@gmail.com`. The application is Wharf, client ID `1f104508-0140-443d-bcd7-8c1874c2ead6`, tenant `d39181f6-e830-4ed6-8e64-b4861e5a21f9`, registration object `9fe929b0-6112-4776-9332-b19af69eed1f`. It supports organizational directories and personal Microsoft accounts. Delegated `User.Read`, `Calendars.ReadBasic`, and `offline_access` were verified. No write permission was added.

With the user's explicit approval, the exact Web callback `https://wharf-calendar-staging.vercel.app/api/auth/microsoft/callback` was added. The existing production and localhost callbacks were preserved. A separate credential named `Wharf isolated staging 2026-11-04` was created with the portal's recommended 180-day lifetime, expiring **May 3, 2027**. Its value was transferred directly into the staging Vercel secret field, without writing it to the repository or logs. The existing credential expiring April 27, 2027 was preserved.

`MICROSOFT_CLIENT_ID` and hidden `MICROSOFT_CLIENT_SECRET` are configured in the **Production environment of the separate staging project** `prj_TCxNuo3KWBnZxdyR0CmqVZ75b08n`. Existing `APP_URL`, staging database, and vault key were retained. Redeployment `GeycEYqfFTiT8FSKpuUFs4i9id43` reached READY at `https://wharf-calendar-staging-1cfy08ump-wharf1.vercel.app` and was aliased to the staging URL. An authenticated provider check returned `microsoft:true`, with Google, iCloud, and Apple false. This is configuration evidence only, not completed delegated calendar access. The actual production Wharf project was not changed.

Read-only checks confirmed the staging provider state/connection and Apple state/account tables, connection-generation and calendar-intent columns, the approved local staging URL/database host, and the existing local vault key's 64-hex format. The remote staging vault key is present as a sensitive variable. Neither local nor remote vault keys were changed. Vercel team membership lists only Ben as owner, with no separate Ray member. The staging project link and access status were sent to Ray at the user's request: `https://vercel.com/wharf1/wharf-calendar-staging`.

Invitation delivery remains blocked on the separate staging sender setup. Google regression and Apple identity setup remain unconfigured. Sign in with Apple does not grant iCloud calendar access, and the password-based iCloud connection was removed at the user's request.

### First live authorization checks

On November 4, staging meeting `4a3ede77-7b19-4ae6-a66f-eceb9e7e0987` was created for March 12 through 16, 2027, 09:00 to 17:00 America/Denver, 30-minute slots. Microsoft presented the dedicated personal account and requested profile, basic calendar read, and ongoing access. **Denial passed**: clicking Deny returned to the same meeting with `calendar=cancelled` and the visible cancellation message. Read-only staging database checks confirmed zero provider connections and zero attendees for this meeting. Acceptance is pending user confirmation; no delegated calendar-read success is claimed.

The initial create-and-connect action exposed an unrelated clipboard stall before the authorization request was sent. Reopening the saved meeting and joining reached Microsoft correctly. The clipboard helper now limits waiting to 1.5 seconds after the created invite URL is available, with the existing manual Copy invite link fallback. A regression test covers an indefinitely pending clipboard write and late completion. The updated helper still needs hosted verification after deployment.

## Calendar fixtures ready for import

The spring series, all-day busy event, and free event were created directly through Outlook's UI in the dedicated account's primary calendar. The event timezone was verified as Mountain Time (US & Canada). Month view confirmed five daily 09:00 to 09:30 busy occurrences from March 12 through 16, an all-day busy event on March 15, and a 13:00 to 14:00 free event on March 12. No attendees were added and no invitations were sent. Outlook initially defaulted the all-day item to Free; it was explicitly changed to Busy before saving. The fall series has not been created. This verifies test-data preparation only, not Wharf authorization or Graph reads.

[outlook-staging.ics](fixtures/outlook-staging.ics) remains an alternative for a fresh test calendar. **Do not import it into this account now**, because the spring cases already exist and import could duplicate them. For a fresh account, import once into its **primary calendar**, with Outlook's calendar timezone set to America/Denver (Mountain Time). The implementation queries `/me/calendarView`, so a secondary calendar is not suitable for this test. The file has no attendees or organizer and sends no invitations. File parsing was checked locally, but Outlook import has not been tested. Inspect the resulting recurrence, all-day status, and Show As values before using imported items as expected provider data.

| Test | Expected busy time |
| --- | --- |
| Spring recurring event | March 12 and 13, 2027: 16:00 to 16:30 UTC. March 14 through 16: 15:00 to 15:30 UTC. Each is 09:00 to 09:30 Denver time. |
| All-day busy | March 15 local midnight through March 16 local midnight, exclusive end. With Denver timezone, 06:00 UTC to 06:00 UTC. It overlaps that day's recurring occurrence. |
| Free event | March 12, 2027, 13:00 to 14:00 Denver time. Must not block availability. |
| Fall recurring event | November 5 and 6, 2027: 15:00 to 15:30 UTC. November 7 through 9: 16:00 to 16:30 UTC. Each is 09:00 to 09:30 Denver time. |

Use separate meeting windows for March 12 through 16 and November 5 through 9, including weekends and 09:00 to 17:00 Denver time. Then move or cancel one occurrence in Outlook and refresh Wharf to check exceptions. Add tentative and out-of-office items through Outlook and check both block time. These are planned live tests, not completed validation.

Run connection, denial, saved reuse, sign-out/in, disconnect/reconnect, concurrent-tab, and invitation checks from [the acceptance record](calendar-provider-validation.md). Record actual results before marking any row passed. Microsoft 365/BYU admin approval remains separate from personal Outlook testing.
