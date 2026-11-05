# Public Slack distribution

Wharf uses the standard Slack OAuth v2 installation flow. Share `https://wharfmeetings.com/slack`, not Slack's bare authorization URL: Wharf must first issue a browser-bound state cookie. This is a free, unlisted pilot. Marketplace listing is a separate Slack review.

## Configuration and rollout

- Apply `db/slack-installations-schema.mjs` before deploying. The full migration also includes these additive statements.
- Set `SLACK_APP_ID`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `SLACK_PUBLIC_INSTALL_ENABLED=true` in the production Vercel environment. Keep existing signing, model, database and token-encryption configuration.
- Use `docs/slack-manifest.json` for scopes, OAuth redirect, event subscriptions and interactivity. Organization-wide installation and token rotation are disabled and rejected by the callback. Do not enable them without implementing their lifecycle.
- Callback: `https://wharfmeetings.com/api/slack/oauth/callback`.
- Remove the experimental rich-preview domain allowlist if configured. Slack restricts work object embeds to partner apps and blocks distribution otherwise. Wharf does not implement the corresponding entity event handler.
- After deploying and verifying installation, complete Manage Distribution and activate public distribution in Slack.

Each installation stores a workspace-bound encrypted bot token. Requests run with an isolated async workspace context. No outgoing Slack API call can silently use a global fallback token. The original workspace can use its environment token only through a matching workspace lookup and retains its allowlist until OAuth reinstall. Other workspaces cannot use that token. Calendar callback notifications and booking announcements explicitly reload the owning workspace.

OAuth state expires after ten minutes and is consumed atomically before code exchange. The callback validates the app, workspace, bot identity, token type and required scopes. Credentials and authorization codes are never logged. Slack uninstall and bot-token revocation events clear the stored token; retained tombstones prevent fallback to revoked legacy credentials. Older uninstall events cannot revoke an installation saved after the event time.

## Supported behavior and limits

Public channels and group DMs, up to 50 conversation members, with Google Calendar availability and invitations. Conversation membership supplies the attendee roster. The requester's Slack time zone is used, with UTC fallback. Private channels, direct messages and organization-wide installation are unsupported. Permissions are unchanged from the original integration.

Scheduling is capped at 100 incoming requests per workspace per UTC day. Interactive follow-up jobs also count toward Jev's daily budget. The app retains existing deterministic meeting and calendar booking idempotency. History reads may be rate-limited for non-Marketplace apps; they skip retries and scheduling can proceed using the explicit request and saved clarification context.

Work uses Next.js `after` with a 120-second duration and durable jobs. It is not a fully managed queue: a terminated worker can require a user retry. Slack message delivery is at-least-once. Do not promise an SLA. Configure provider account spending limits before a broad announcement.

## Validation and release checks

`npm test`, `npm run typecheck`, and `npm run build` cover the application plus concurrent token isolation, absent-context failure, encryption binding, OAuth validation and single-use state. Live validation must additionally install via the production button, verify the encrypted installation row without printing the credential, exercise a mention and private controls, and check calendar booking with consenting accounts. A second independent workspace should be tested before broad promotion.

Rollback: set `SLACK_PUBLIC_INSTALL_ENABLED=false` and deploy to close new installs while retaining service to existing installs. Keep the additive tables. Rolling back to single-workspace code disables newly installed workspaces. Do not delete active installation credentials to roll back code.

## Marketplace submission

As checked November 5, 2026, Slack requires at least 10 installations on active workspaces before submission. Slack also restricts low-usage submissions under its November 2 update. See the current [review guide](https://docs.slack.dev/slack-marketplace/slack-marketplace-review-guide/) and [submission criteria](https://docs.slack.dev/changelog/2026/11/02/slack-marketplace-submission-criteria/). Do not fabricate installs, usage or compliance answers.

Listing copy: Wharf helps your Slack conversation find a shared meeting time. Mention Wharf with a day, time window and duration, connect calendars privately, and confirm a suggested time. Only the requester can book. Google Calendar sends the invitations.

Landing/install: https://wharfmeetings.com/slack
Support: https://wharfmeetings.com/support
Privacy: https://wharfmeetings.com/privacy
Terms: https://wharfmeetings.com/terms
Contact: bencalvert04@gmail.com

Google OAuth verification and workspace administrator policies independently control whether new users can connect calendars. A public Slack install does not bypass Google consent, verification limits, or administrator approval.
