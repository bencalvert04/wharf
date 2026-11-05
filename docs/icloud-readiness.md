# iCloud Calendar implementation status

Verified November 5, 2026. No purchases, subscriptions, Apple account changes, or live calendar reads were made during this work.

## Research outcome

The desired experience is Apple-hosted authorization to read iCloud Calendar. Ordinary Sign in with Apple is a separate identity feature and cannot grant calendar access.

| Product / source | Verified integration | Consequence for Wharf |
| --- | --- | --- |
| [Apple third-party access](https://support.apple.com/en-us/121539) | Supported apps can request Apple Account authorization for Mail, Calendar, and Contacts. | The password-free experience exists, but this consumer article does not provide developer enrollment or protocol details. |
| [Apple Developer Technical Support](https://developer.apple.com/forums/thread/825772) | Apple confirms an iCloud OAuth pilot and an interest form. | Approval, credentials, endpoints, scopes, and applicable website eligibility must come from Apple. Membership alone does not establish admission. |
| [Notion Calendar](https://www.notion.com/help/create-a-notion-calendar-account) | iCloud connection requires an app-specific password. | It is not evidence of generally available iCloud OAuth. |
| [Cronofy](https://docs.cronofy.com/connect/calendar-users/connecting-to-apple-icloud/) | Its hosted Apple connection also asks for an app-specific password. | Adding this broker would not deliver the requested password-free experience based on its published flow. No paid integration was added. |
| [Apple web sign-in configuration](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/) | A web Services ID is associated with a Sign in with Apple-enabled primary App ID. | Existing identity sign-in code needs real Apple registration and keys. |
| [Apple website usage guidelines](https://developer.apple.com/sign-in-with-apple/usage-guidelines-for-websites-and-other-platforms/) | The JavaScript API guidelines require an App Store app and limit sign-in APIs to authentication. | Website-only eligibility remains an Apple support question; neither REST calls nor a placeholder App ID establish an exemption. |

This comparison verifies published product documentation, not successful logins to those products. No third-party accounts were created.

## Observed external blockers

The signed-in [iCloud OAuth interest page](https://developer.apple.com/contact/request/icloud-oauth2/) displayed **Your account can't access this page**. The page mentions developer-program membership and the Account Holder's license agreement. This is an access denial, not proof that paying membership would grant pilot admission. No form could be completed.

The connected Gmail account was searched for Apple messages since November 1 and support case `103017230975`. It contains acknowledgments dated November 2 and November 4, plus the Developer Agreement notice. No eligibility decision, pilot invitation, or integration credentials were found. The agreement notice does not establish paid membership.

Wharf's earlier product decision excludes app-specific-password entry. That route remains disabled. Apple identity sign-in remains independent of calendar availability.

## Work completed in this change

- Extracted `icloudAvailabilityFromClient` from credential acquisition. The existing legacy client uses it; a future approved calendar client can reuse it if Apple's eventual API uses compatible CalDAV. This is not an implemented OAuth adapter.
- Retained all-calendar reads, recurrence expansion, calendar timezone handling, clipping to meeting hours, and rejection of partial results.
- Fixed the read-only Apple transport to honor a `Request` object's method and headers, respect caller cancellation, and use one 15-second deadline across redirects. Body-bearing `Request` inputs require an explicit replayable body so a redirect cannot silently drop it. Write methods and foreign hosts remain blocked.
- Added tests for multiple calendars, reminder-only calendars, empty calendars, partial failures, invalid discovery URLs, cancellation, and redirect behavior.
- Added an offline identity configuration check for the Services ID, team/key identifiers, HTTPS origin, and PKCS#8 P-256 private key. It never prints secrets or contacts Apple, and never reports iCloud Calendar ready.

Existing code already supplies identity OAuth state/nonce checks, signed token verification, browser binding, session intent protection, encrypted provider credential storage, and busy-time parsing. None of this supplies the missing iCloud OAuth grant.

Run the new check after real identity credentials are available:

```sh
npm run apple:check -- --env-file /absolute/path/to/private.env --expected-app-url https://wharf-calendar-staging.vercel.app
```

The env file must be owner-readable only (`chmod 600`). The check reads only the specified file. Passing means the local format is valid, not that Apple has approved the app or that the key belongs to the registered team.

## Prepared application content

The following is ready to adapt to Apple's actual form when access becomes available. It has not been sent.

**Product:** Wharf, https://wharfmeetings.com

**Platform:** Browser-based meeting coordination website. No published native Apple-platform app currently exists.

**Requested access:** Apple-hosted authorization for read-only iCloud Calendar access. Wharf uses busy intervals to find mutual meeting times. It does not need Mail or Contacts access. Calendar titles, descriptions, locations, and attendees are not needed for availability. If CalDAV event payloads are required, they would be processed server-side into busy intervals rather than retained as event content.

**User experience:** The user chooses iCloud Calendar in Wharf, authorizes access with Apple, and returns to the meeting. Wharf must never collect the user's Apple Account password or an app-specific password. Users can disconnect their calendar. Identity sign-in and calendar authorization must remain distinct.

**Questions for Apple:** Can this website-only product participate? Is paid membership required to apply, and can eligibility be confirmed before purchase? What calendar scopes and least-privilege grants are available? Please provide the approved authorization/token/discovery endpoints, client registration and authentication requirements, PKCE requirements, refresh and revocation behavior, account identity rules, and notification verification requirements. Does the pilot provide CalDAV access or another calendar API?

## Remaining implementation after Apple approval

1. Register Apple's approved calendar client and exact return URLs. Do not reuse identity-only `APPLE_CLIENT_ID` unless Apple's integration instructions explicitly require it. Do not assume `name email` permits calendar access.
2. Implement the actual documented consent/code exchange, state binding, PKCE if supported, and verified calendar account identity. Preserve Wharf's session/account intent guard through callback and persistence. Never merge a private-relay identity with a calendar account by email.
3. Store the approved refresh credential using the existing account-bound vault, retaining the stable encryption key. Add the actual grant type to provider storage without interpreting old username/password JSON as OAuth tokens. Implement refresh rotation, expiry, revocation, disconnect, and any signed notifications required by Apple.
4. Wire an authenticated calendar client to the reusable reader only if compatible with Apple's approved protocol. Extend the endpoint allowlist only for documented Apple hosts. Expose iCloud as available only when this complete integration is configured.
5. Apply any necessary additive migration to isolated staging. Verify the callback can receive Apple's actual response through staging protection without losing state or weakening protection silently.
6. Run real account tests: consent/denial, first/repeat connection, private relay if applicable, multiple calendars, all-day/DST/recurrence exceptions, empty calendars, revoked/expired grants, refresh rotation, partial provider errors, concurrent tabs, logout during authorization, disconnect/reconnect, and meeting ownership. Verify failures never save a falsely free snapshot.
7. Review the resulting implementation and deploy after real staging evidence. No new production functionality has been enabled by this change.

No dummy OAuth endpoints, guessed calendar scopes, synthetic production credentials, or cosmetic calendar-connected state have been added.

## Validation evidence

On November 5, the full local suite passed all 246 tests. After correcting missing URL fields in the new typed test fixtures, the production build (including TypeScript validation) passed, and all seven new tests passed again. Tests use synthetic identities and simulated provider responses, not a real Apple calendar. The production providers endpoint returned HTTP 200 with `icloud:false` and `apple:false`; Google and Microsoft remain enabled. No production deployment or database migration was performed.
