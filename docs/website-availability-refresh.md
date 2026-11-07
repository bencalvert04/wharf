# Website availability refresh

Connected attendees do not need to keep Wharf open. Existing calendar grants are reused; no new scopes are requested. A successful join schedules a server-side refresh after the response. While the organizer views an unfinished meeting, the page requests refresh on entry, visibility return, and every two minutes. Other viewers receive the updated snapshots through the existing 15-second meeting polling. This is on-demand polling, not calendar webhooks or continuous monitoring while every page is closed.

A shared Neon lease prevents overlapping refreshes across tabs/instances. Ordinary refreshes are coalesced for two minutes unless the meeting revision changes (for example, someone joins). The organizer's Refresh action can bypass that interval with a ten-second endpoint cooldown. Finalization always requests a fresh check; an in-flight check blocks finalization until it finishes. All snapshots are committed together only if the meeting revision, refresh lease, and captured calendar-account intent generations are still valid. Provider reads happen outside database transactions. Failure preserves the previous snapshots and blocks a new booking.

Manual availability is never fetched or overwritten. Attendee or availability changes cause finalization to stop for review rather than silently select another time. The previous selection remains displayed and is marked stale until a new selection. Existing finalized invitation jobs retain their retry behavior without checking calendars again. A final check cannot eliminate a concurrent change made directly in a calendar just after the check.

## Before deployment

Run the normal additive database migration against the intended environment. This includes `db/availability-refresh-schema.mjs` and the updated functions from `db/pending-meeting-schema.mjs`. **No production migration has been run for this work.** The refresh transaction sets a transaction-local flag so passive snapshot updates do not extend Pending inactivity, change participation history, or undo personal dismissals. Ordinary attendance mutations retain those behaviors.

Test with real Google accounts in staging: join, add a conflicting calendar event after joining, refresh, then try finalization with a previously selected slot. Verify missing/revoked access blocks booking with a useful message, and manual availability stays unchanged. Database/provider tests use isolated embedded PostgreSQL and fake provider transports; they do not prove live credentials are correctly configured.

## Checks

- Refresh store: lease coalescing, membership changes, expired leases, finalized meetings, manual preservation, inactivity/dismissal preservation.
- Provider integration: success, failure, and stale calendar-account intents.
- HTTP routes: authorization, fresh final check, conflict naming, failure blocking, finalized retry.
- Full existing test suite and production build.
