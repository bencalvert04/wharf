# Mirroring Apple sign-in on other websites

Checked November 5, 2026. This follow-up distinguishes publicly available identity sign-in from the separate iCloud Calendar authorization pilot.

## Direct website observations

- Spotify's public login page offers Continue with Apple. Following it, without signing in or entering credentials, opened Apple's authorization page for Spotify. Its public protocol parameters were `response_type=code`, `response_mode=form_post`, `scope=name email`, Services ID `com.spotify.accounts`, and return URL `https://accounts.spotify.com/login/apple/redirect`. No authorization state values or user credentials are recorded here. [Spotify's support article](https://support.spotify.com/al/article/apple-login-help/) also documents Apple login.
- WordPress.com's [login page](https://wordpress.com/log-in) offers Continue with Apple. No login was completed, and its downstream protocol was not inspected because continuing is presented alongside acceptance of its terms. Seeing its button establishes that the service offers Apple identity sign-in, not its internal implementation or calendar access.

Wharf already uses the same public Apple authorization endpoint, code response, form POST, and name/email scopes observed at Spotify. It also verifies signed identity tokens and binds state and nonce to the initiating browser. These protocols can be mirrored. Another company's registered client identifier, key, or return URL cannot be reused for Wharf.

## Hosted authentication providers

| Provider | Relevant documented setup | Can it avoid Wharf's production registration blocker? |
| --- | --- | --- |
| [Clerk](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/apple) | Development instances use shared OAuth credentials. Production requires the app's own Services ID, private key, Team ID, and Key ID. | A free development demonstration is possible after creating/configuring a Clerk project. Shared development credentials are not a production solution or an iCloud grant. |
| [Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple) | Web Apple login requires an App ID, attached Services ID, registered callback, and signing key from Apple. | No. It hosts the callback and user management, but still needs Apple registration. |
| [Amazon Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-social-idp-apple.html) | Register Apple's identifiers/key and the Cognito return URL, then configure Apple as an identity provider. | No. A different callback owner does not eliminate Apple credentials. |

The Clerk development option is a real distinction from the earlier investigation. No Clerk account was created, no terms accepted, and no unrelated identity system was added to production. It would demonstrate Apple login under shared development registration, but would not activate Wharf's current production client or connect calendars. The native Wharf implementation avoids an additional authentication service and is already covered by synthetic end-to-end callback tests.

## Registration access verified separately

The signed-in Apple **Certificates, Identifiers & Profiles** page at `https://developer.apple.com/account/resources/identifiers/list` displayed **Access Unavailable** and stated that the resource is only available to developers enrolled in a developer program or members of an organization's enrolled team. This is the standard registration area, not the iCloud OAuth pilot page.

Consequently, this account cannot currently create Wharf's primary App ID, Services ID, or signing key. No purchase was made. An existing enrolled team could be another route if the user legitimately belongs to one and has access; no such access was available in the observed account.

Apple's [web configuration guide](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/) requires an associated primary App ID. Its [JavaScript usage guidelines](https://developer.apple.com/sign-in-with-apple/usage-guidelines-for-websites-and-other-platforms/) mention an App Store app requirement. Third-party setup guides do not establish an exemption for website-only use. The existing Apple support eligibility question remains appropriate, but ordinary identity sign-in itself is not a pilot.

## Additional implementation

Added `/api/auth/apple/notifications` for Apple's signed revocation, account-deletion, and email-forwarding notifications, following [Apple's notification specification](https://developer.apple.com/documentation/signinwithapple/processing-changes-for-sign-in-with-apple-accounts).

- Verify RS256 signatures using Apple's public keys, exact configured audience, issuer, issued-at age, event time, subject, and event identifier. The notification audience is explicit because Apple may use the primary App ID rather than the web Services ID.
- Bound request bodies before parsing. Invalid signatures never reach database writes. Storage failures return 503 so delivery can retry.
- Process a hashed event identifier and session invalidation atomically under the existing calendar-intent advisory lock.
- Sign out all affected Apple sessions without changing Google/Microsoft identities or deleting meetings. Apple account deletion also removes the saved Apple profile.
- Invalidate older in-flight Apple callbacks through the existing account intent marker.
- Remember successful deliveries to prevent duplicate notifications from signing out a later login. Use authentication start timestamps to preserve newer sessions when old notifications arrive late. Same-second comparisons conservatively treat the notification as applying to the session.

Email forwarding notifications update a hashed-address preference with event ordering. The SMTP invitation path checks that preference before sending to Apple private-relay recipients. Older email-enabled events cannot undo newer disabled preferences; disabled wins when event timestamps tie. Suppressed invitations remain available for operator review and are labeled as not sent rather than as ambiguous SMTP delivery. Unknown future event types are rejected for review.

Account deletion here removes the Apple sign-in profile and session access, not shared meeting records or unrelated providers' credentials. The existing account DELETE route is logout, not a user-account deletion feature. A future local account-deletion feature will need Apple's token-revocation flow as part of its own design. None of these additions grants calendar access.

Notification receipt hashes are retained to recognize duplicates. Relay-address hashes and preferences are retained to avoid resuming email after a user's forwarding opt-out. Notification tokens are accepted within a local seven-day issued-at window with five minutes of clock tolerance. Confirm that window against Apple's actual delivery/retry behavior during live staging tests.

## Activation sequence

1. Resolve legitimate access to Apple identifiers and confirm website eligibility. No change to Wharf's code can create Apple's registration credentials.
2. Register the primary App ID, web Services ID, domains, and exact callback URLs. Set the four existing `APPLE_*` identity values and run `npm run apple:check`.
3. Apply migrations before deploying this callback: `db/apple-notification-schema.mjs` adds authentication timestamps, notification receipts, and the atomic revocation function. This was exercised locally in PostgreSQL-compatible PGlite, not applied to production.
4. When configuring notification delivery, set `APPLE_NOTIFICATION_AUDIENCE` to the actual registered audience and register the HTTPS notification URL. Verify all four event types with Apple in staging before enabling delivery in production.
5. Test Apple's real consent, Hide My Email, repeat login, cancellation, revocation, deletion, and hosted callback reachability in isolated staging.
6. Pursue the separate iCloud Calendar OAuth registration for actual calendar reads. Completing identity sign-in does not remove that dependency.

## Follow-up validation

All 252 automated tests pass, including signed notification validation, database-backed revocation/replay/delayed-delivery tests, callback regressions, relay event ordering, and SMTP suppression. The production build and separate TypeScript check pass. No Apple account was authorized against Wharf, no notification was delivered by Apple, no migration was applied outside local test databases, and no production deployment or purchase was made.
