# Official Sign in with Apple

## Implementation

The staging branch replaces the Apple Account email/app-specific-password form with a Sign in with Apple button in the header login dialog. Calendar connection has no password form. The old `provider:icloud` submission returns HTTP 410 before accessing accounts or calling Apple. CalDAV code remains for preservation and existing connections, but it cannot accept new credentials through the website.

Apple login uses `https://appleid.apple.com/auth/authorize`, requests only `name email`, and receives a `form_post` at `/api/auth/apple/callback`. The server exchanges the single-use authorization code with Apple and verifies Apple's RS256 token signature, issuer, audience, expiry, issued-at age, nonce, subject, and verified email. Developer client secrets are signed with ES256 and expire in five minutes. No Apple user password is entered into Wharf or sent to its server.

A ten-minute, HTTP-only, Secure, SameSite=None, host-only binding cookie protects Apple's cross-site POST. The primary session remains SameSite=Lax. Hashed single-use states are tied to that binding and the existing session. The durable intent guard rejects stale callbacks after logout or newer provider activity, including changes during token exchange. Apple identities use `apple:` namespacing and cannot be silently merged with Google accounts by email. Sign-in saves a profile/session only; no calendar grant, attendee snapshot, or invitation is created. First-login display names are bounded and treated as display text, never identity. Profiles are cleaned up after 30 days without a new sign-in.

## Activation blocker observed November 2, 2026

The user signed into the official Apple Developer portal. The account displayed **Join the Apple Developer Program**, **Enroll today**, and free developer resources. No enrolled membership or Wharf Services ID/private key was established. No enrollment, purchase, key creation, or Apple permission request was submitted. Apple sign-in remains unavailable until real registration and credentials are supplied. Synthetic test keys must never be deployed.

Apple's web configuration documentation requires an associated Sign in with Apple-enabled primary App ID. Its environment guide also describes an existing App Store app requirement. Confirm the team's eligibility and applicable app requirements with Apple rather than assuming buying membership alone activates a website-only project.

## Configuration

Configure the correct Apple developer team, a primary App ID with Sign in with Apple, a web Services ID, and a Sign in with Apple private key. Register the staging domain and exact return URL:

- Domain: `wharf-calendar-staging.vercel.app`
- Return URL: `https://wharf-calendar-staging.vercel.app/api/auth/apple/callback`

Set these server-only values in the separate staging Vercel project:

- `APPLE_CLIENT_ID`: web Services ID.
- `APPLE_TEAM_ID`: developer team ID.
- `APPLE_KEY_ID`: key ID.
- `APPLE_PRIVATE_KEY`: `.p8` private key contents; escaped newlines are accepted.

Never paste the key into chat, commit it, or replace the existing vault key. Apply `db/apple-signin-schema.mjs` through migrations before deploying Apple handlers. `APP_URL` must match the registered HTTPS origin. Apple does not accept localhost callback URLs.

Vercel Authentication protects the staging deployment. Before enabling Apple, verify that its cross-site form POST reaches the callback with the binding cookie intact. A protection login redirect may discard the POST. Resolve callback reachability through an explicitly reviewed deployment-protection configuration, without putting a bypass secret in Apple's return URL or disabling protection on the whole site silently. Register private email relay sender domains before relying on delivery to relay addresses. Server-to-server account-revocation notifications and live account deletion/revocation behavior need review before production rollout.

## Validation

All 236 automated tests pass, along with the production build and TypeScript check. The additive Apple state/profile tables were applied only to the isolated staging database before deployment.

Automated tests exercise the real signature verification and PostgreSQL state/intent protocol with synthetic identities. They cover successful login and return-meeting context, invalid token claims/signatures, browser binding, denial, one-time state consumption, sign-out during token exchange, origin checks, missing registration, and rejected legacy password submission. These are not real Apple authorization tests.

Before release, test actual Apple consent, Hide My Email, first and repeat login, cancellation, expired/replayed callbacks, concurrent tabs, logout during authorization, meeting ownership, and the protected hosted callback. Confirm the account panel never claims iCloud availability is connected. Live Apple sign-in has not been completed.

References: [Web configuration](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web), [Apple environment setup](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple), [Apple authorization endpoint](https://developer.apple.com/documentation/signinwithapplerestapi/request-an-authorization-to-the-sign-in-with-apple-server.), [Separate iCloud calendar OAuth pilot](https://developer.apple.com/forums/thread/825772).

## Staging deployment evidence

Source commit `6f5a8a4` was deployed to the separate staging project as `dpl_5ewMv9nXXo5C583WAAkujkNobwz3`. The stable URL is https://wharf-calendar-staging.vercel.app. Browser inspection confirmed the Sign in with Apple button and no Apple username/password fields. The button is disabled pending registration. Authorized hosted checks returned `icloud:false`, `apple:false`; legacy password submission returned HTTP 410, and the official Apple start endpoint returned HTTP 503 with the registration explanation. No real Apple login token was exchanged. Production was not deployed or migrated.

## Enrollment follow-up, November 2, 2026

The user requested help enrolling and selected individual membership under their legal name. The signed-in Apple portal was opened through Enroll today, then Continue enrollment on the web. It reached the personal-information form at `https://developer.apple.com/enroll/identity/edit`. The user was asked to enter legal identity/contact details directly and stop before payment. No enrollment information, agreement acceptance, or purchase was submitted by the agent.

Before payment, the published [Sign in with Apple usage guidelines](https://developer.apple.com/sign-in-with-apple/usage-guidelines-for-websites-and-other-platforms/) were checked again. They explicitly require an App Store app for the web API. The [web setup documentation](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web) also requires a related primary Apple-platform App ID. Wharf is currently website-only. The user was informed that the USD 99 annual membership alone does not resolve this requirement and was asked whether to confirm website-only eligibility with Apple, pursue an iPhone app, or enroll independently of this feature. Do not represent a placeholder App ID or direct REST calls as an exemption from Apple's published eligibility requirements.

The user completed the personal-information step directly and reached `https://developer.apple.com/enroll/purchase`. The page offered the USD 99 membership purchase with automatic renewal unchecked. The agent did not continue to payment or purchase membership.

At the user's explicit request, an inquiry was submitted through Apple Developer Support under Membership and Account > Program Enrollment. Apple confirmed receipt on November 2, 2026, with case ID `103017230975` and said it would reply by email. The inquiry identifies Wharf as website-only and asks whether Sign in with Apple is permitted without a published native app, whether primary App ID and Services ID registration is sufficient or additional approval is needed, and whether a corresponding native app must be published first. It explicitly distinguishes identity sign-in from iCloud Calendar access. Eligibility is still unconfirmed pending Apple's response.

Current state: membership purchase and actual Apple sign-in activation are incomplete; no Apple developer keys have been created. Existing staged implementation and production remain unchanged during this enrollment investigation.
