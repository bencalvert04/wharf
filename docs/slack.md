# Wharf in Slack

This is a single-workspace, single-channel demo integration. It uses Haiku to interpret a scheduling request, then Wharf's existing authenticated meeting APIs for availability and Google Calendar booking. Calendar data and meeting credentials are never passed to the model. Only the scheduling message, Slack participant IDs, requester timezone, and current date go to Anthropic.

## Setup

1. Create a Slack app from `docs/slack-manifest.json` in the intended workspace. If Slack requires the event URL to be verified before credentials exist, omit `event_subscriptions` initially and add it after step 4.
2. Install it with app_mentions:read, chat:write, im:write, and users:read. Invite the bot into the Wharf channel. It does not require channel history or email access.
3. Configure server-only Vercel production variables: SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN, SLACK_TEAM_ID, SLACK_CHANNEL_ID, ANTHROPIC_API_KEY, SLACK_AGENT_MODEL. The default model is claude-haiku-5-5. Set an Anthropic project spending limit for the demo. Existing DATABASE_URL and GOOGLE_TOKEN_ENCRYPTION_KEY must remain configured.
4. Run the database migration and deploy. Set Events Request URL to https://wharfmeetings.com/api/slack/events, subscribe to app_mention, and set Interactivity URL to https://wharfmeetings.com/api/slack/interactions. Use one canonical callback host even if Wharf has two domains.

## Demo

Mention the bot: `@Wharf schedule 30 minutes with @Ray next week`. Use real Slack mentions, not typed display names. The requester is always included. If details are missing, repeat the full request with the clarification. Start each new meeting in a new thread.

The bot proposes dates, timezone, working hours, weekdays, duration, and participants. The requester clicks Create meeting. Every participant receives only their own join link in a DM. After everyone connects, the requester clicks Check availability. Wharf privately asks that requester for Google Calendar authorization if needed. After authorization, Check availability offers three exact shared slots. Confirm and send invites performs the booking. Only the original requester can operate buttons; stale choices are rejected by the existing revision checks. Repeated booking recovers the same Google event.

The demo uses explicit refresh buttons, not background polling. It does not automatically follow up as people join. It cannot access calendars until participants join and cannot bypass Google's unverified-app flow. Google guest settings can prevent invitations from appearing automatically.

## Reliability and costs

Slack signatures, timestamps, workspace and channel restrictions are enforced. Durable database jobs deduplicate event deliveries and use a three-minute processing lease. Work runs through Next.js `after` with a 120-second maximum. Failed steps show a retry message; user buttons allow recovery. A process terminated by the hosting platform may require another mention or button click. Delivery to Slack is at-least-once, so a crash after a DM is sent can produce a duplicate message, but meeting creation and calendar booking are idempotent.

Haiku is called only for new requests, with 900 output tokens and at most 4,000 characters of input. A daily workspace limit of 100 incoming scheduling mentions bounds normal demo usage. No automatic model upgrade or fallback to a more expensive model. Slack job payloads are removed after success; a daily cleanup removes records older than 30 days. Meeting bearer keys are encrypted at rest using the existing token vault with separate associated-data labels.

## Validation

Run `npm test`, `npm run typecheck`, and `npm run build`. Before recording, test in the configured channel with two accounts: draft confirmation, private invitations, both joins, organizer consent, slot confirmation, duplicate click, and a click from someone other than the requester. Live provider tests require installed Slack credentials and funded Anthropic API access.
