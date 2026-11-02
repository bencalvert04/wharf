# Microsoft staging test

## Current blockers, November 2, 2026

The user completed signup directly. Browser inspection confirmed a provisioned inbox and calendar for the dedicated test account `wharf.calendar.test2026@outlook.com`. No password is stored in this repository.

No Microsoft app secret was found in the local environment files for the main, reconciliation, or staging worktrees. The Entra portal requires sign-in. The known application ID is `1f104508-0140-443d-bcd7-8c1874c2ead6`, but registration ownership, secret expiration, and staging callback configuration have not been verified. Creating an Outlook inbox does not grant access to this existing app registration.

The registration owner must add the following exact **Web** callback while preserving existing callbacks:

`https://wharf-calendar-staging.vercel.app/api/auth/microsoft/callback`

Verify personal and organizational account support and delegated `User.Read`, `Calendars.ReadBasic`, and `offline_access`. Store a valid app secret securely in the isolated staging project. Keep the existing staging vault key stable. Do not configure production or enable the staging button with placeholder credentials. Invitation delivery remains blocked on the separate staging sender setup.

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
