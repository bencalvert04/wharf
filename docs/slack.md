# Wharf in Slack

This is a single-workspace, allowlisted-conversation demo integration. It uses Haiku to interpret a scheduling request, then Wharf's existing authenticated meeting APIs for availability and Google Calendar booking. Calendar data and meeting credentials are never passed to the model. Scheduling text, bounded conversation context with author IDs and timestamps, timezone, and current date go to Anthropic.

## Setup

1. Create a Slack app from `docs/slack-manifest.json` in the intended workspace. If Slack requires the event URL to be verified before credentials exist, omit `event_subscriptions` initially and add it after step 4.
2. Install the scopes in the manifest, including channels:read and channels:history for channel naming and recent context. Invite the bot into the Wharf channel. Email access is not required.
3. Configure server-only Vercel production variables: SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN, SLACK_TEAM_ID, SLACK_CHANNEL_ID, ANTHROPIC_API_KEY, SLACK_AGENT_MODEL. The default model is claude-haiku-5-5. Set an Anthropic project spending limit for the demo. Existing DATABASE_URL and GOOGLE_TOKEN_ENCRYPTION_KEY must remain configured.
4. Run the database migration and deploy. Set Events Request URL to https://wharfmeetings.com/api/slack/events, subscribe to app_mention, and set Interactivity URL to https://wharfmeetings.com/api/slack/interactions. Use one canonical callback host even if Wharf has two domains.

## Demo

Mention the bot: `@Wharf schedule 30 minutes with @Ray next week`. Use real Slack mentions, not typed display names. The requester is always included. If details are missing, repeat the full request with the clarification. Start each new meeting in a new thread.

The bot immediately creates an open meeting through the same service used by the public meeting API and posts a shared join link in the main conversation. Anyone can join by connecting their calendar. The first person to join becomes the planner and can choose a shared time and send Google Calendar invitations through the website. Existing reserved-roster meetings retain their original Slack booking controls.

An explicit requested meeting name takes priority. Otherwise channel meetings use the channel name and group DMs use human attendee names. Recent history supplies clearly relevant missing details: up to 15 human messages from the last seven days, bounded to 6,000 characters. Thread replies are read where Slack permits them; channel history and saved clarifications remain available otherwise. History reads run in parallel with metadata/database work, share a 1.5-second deadline, and skip retries. Current explicit details override background. Background is not stored in the clarification record.
The demo uses explicit refresh buttons, not background polling. It does not automatically follow up as people join. It cannot access calendars until participants join and cannot bypass Google's unverified-app flow. Google guest settings can prevent invitations from appearing automatically.

## Reliability and costs

Slack signatures, timestamps, workspace and channel restrictions are enforced. Durable database jobs deduplicate event deliveries and use a three-minute processing lease. Work runs through Next.js `after` with a 120-second maximum. Failed steps show a retry message; user buttons allow recovery. A process terminated by the hosting platform may require another mention or button click. Delivery to Slack is at-least-once, so a crash after a channel message is sent can produce a duplicate message, but meeting creation and calendar booking are idempotent.

Haiku is called only for new requests, with a 700 output-token ceiling, up to 12,000 characters of request/follow-up text and 6,000 characters of older conversation context. A daily workspace limit of 100 incoming scheduling mentions bounds normal demo usage. No automatic model upgrade or fallback to a more expensive model. Slack job payloads are removed after success; a daily cleanup removes records older than 30 days. Meeting bearer keys are encrypted at rest using the existing token vault with separate associated-data labels.

## Validation

Run `npm test`, `npm run typecheck`, and `npm run build`. Before recording, test in the configured channel with two accounts: automatic creation, shared channel invitation, both joins, organizer consent, slot confirmation, duplicate click, and a click from someone other than the requester. Live provider tests require installed Slack credentials and funded Anthropic API access.

Group DMs: configure SLACK_GROUP_CHANNEL_IDS (comma-separated allowlist) and SLACK_BOT_USER_ID. Install mpim:history and mpim:read and subscribe to message.mpim. Only explicit bot mentions trigger responses; normal conversation is ignored. Everyone joins through the open link; membership is used for DM naming and attendance mentions, not a reserved roster. Before creation, up to six requester messages in the same thread are retained for one day to resolve clarification. Existing meetings remain immutable; requests to change them receive guidance to start a new message. Greetings and status commands are deterministic. No automatic retry worker is configured.
