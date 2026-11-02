# Microsoft staging test

## Current blockers, November 2, 2026

The user authorized creating a dedicated free Outlook test account. Microsoft's official signup accepted the proposed address and reached password creation. Account creation, terms, verification, and mailbox provisioning are not yet confirmed. The account owner completes those steps directly. No password is stored in this repository.

No Microsoft app secret was found in the local environment files for the main, reconciliation, or staging worktrees. The Entra portal requires sign-in. The known application ID is `1f104508-0140-443d-bcd7-8c1874c2ead6`, but registration ownership, secret expiration, and staging callback configuration have not been verified. Creating an Outlook inbox does not grant access to this existing app registration.

The registration owner must add the following exact **Web** callback while preserving existing callbacks:

`https://wharf-calendar-staging.vercel.app/api/auth/microsoft/callback`

Verify personal and organizational account support and delegated `User.Read`, `Calendars.ReadBasic`, and `offline_access`. Store a valid app secret securely in the isolated staging project. Keep the existing staging vault key stable. Do not configure production or enable the staging button with placeholder credentials. Invitation delivery remains blocked on the separate staging sender setup.

## Calendar fixtures ready for import

Import [outlook-staging.ics](fixtures/outlook-staging.ics) once into the dedicated test account's **primary calendar**, with Outlook's calendar timezone set to America/Denver (Mountain Time). The implementation queries `/me/calendarView`, so a secondary calendar is not suitable for this test. The file has no attendees or organizer and sends no invitations. Import has not yet been performed. Inspect Outlook's resulting recurrence, all-day status, and Show As values before using them as expected provider data. Avoid repeated imports because Outlook may duplicate items.

| Test | Expected busy time |
| --- | --- |
| Spring recurring event | March 12 and 13, 2027: 16:00 to 16:30 UTC. March 14 through 16: 15:00 to 15:30 UTC. Each is 09:00 to 09:30 Denver time. |
| All-day busy | March 15 local midnight through March 16 local midnight, exclusive end. With Denver timezone, 06:00 UTC to 06:00 UTC. It overlaps that day's recurring occurrence. |
| Free event | March 12, 2027, 13:00 to 14:00 Denver time. Must not block availability. |
| Fall recurring event | November 5 and 6, 2027: 15:00 to 15:30 UTC. November 7 through 9: 16:00 to 16:30 UTC. Each is 09:00 to 09:30 Denver time. |

Use separate meeting windows for March 12 through 16 and November 5 through 9, including weekends and 09:00 to 17:00 Denver time. Then move or cancel one occurrence in Outlook and refresh Wharf to check exceptions. Add tentative and out-of-office items through Outlook and check both block time. These are planned live tests, not completed validation.

Run connection, denial, saved reuse, sign-out/in, disconnect/reconnect, concurrent-tab, and invitation checks from [the acceptance record](calendar-provider-validation.md). Record actual results before marking any row passed. Microsoft 365/BYU admin approval remains separate from personal Outlook testing.
