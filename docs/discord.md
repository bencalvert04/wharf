# Wharf for Discord

Discord runs the same `slackMention` / `slackAction` scheduling workflow, interpreter, availability engine, calendar identity linking, organizer authorization, and booking implementation as Slack. `discord-client.ts` adapts that workflow's transport calls to Discord. Existing database table names remain unchanged; Discord server IDs use the `discord:` prefix to isolate identities and conversations from Slack.

## Setup

1. Create a Discord application named Wharf. Copy its application ID and public key from General Information. Configure its bot token as a server secret.
2. Set `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, and `DISCORD_BOT_TOKEN` in Vercel. Set `DISCORD_DEFAULT_TIMEZONE` if America/Denver is not appropriate.
3. Apply `db/discord-schema.mjs` using the existing migration runner, then deploy.
4. Set the Interactions Endpoint URL to `https://wharfmeetings.com/api/discord/interactions`. The endpoint verifies Ed25519 signatures, rejects stale requests, and answers Discord's verification ping.
5. Register the command with `node --env-file=.env.local scripts/register-discord.mjs`.
6. Enable Guild Install. Install with the link on `/discord`, using only View Channels and Send Messages permissions. No privileged message-content or guild-member intents are needed.

## Use

Run `/wharf request: 30 minutes tomorrow afternoon attendee_1: @Maya attendee_2: @Jon`. Optional `timezone` accepts an IANA timezone. The organizer and selected human attendees form the roster. Wharf does not enumerate the server's members or read channel history.

The agent asks missing-detail questions privately. Buttons and a private modal continue the same request. Attendees receive private calendar prompts, with direct messages used when they are not the current interaction's user. If direct messages are blocked, they can click Connect calendar privately on the channel message to receive their link privately. The requester chooses a suggested time before calendar invitations are sent. `/wharf request: book a time that works` can continue a single open meeting in the channel; when multiple meetings exist, use their individual buttons.

## Reliability and privacy

Interaction payloads are signature-verified before parsing or database writes. A durable job is inserted before the deferred private response. Discord interaction IDs deduplicate deliveries. Interaction credentials are encrypted in stored jobs and removed at completion or failure. Buttons have opaque IDs pointing to expiring server-side records, bound to their originating server, channel, and private recipient. Calendar tokens stay in the existing credential vault. Automated messages disable all mention parsing.

A partial failure does not automatically repeat booking work. The requester can retry a button; the shared calendar booking logic enforces idempotency. Calendar callbacks and booking announcements restore the Discord transport from the namespaced server ID, even outside the original interaction. Existing cleanup removes expired component records.

The interactive website preview is browser-only. It never calls Discord or connects real calendars. Teams is a disabled coming-soon menu option.

## Verification

- `npm test`
- `npm run typecheck`
- `node --import tsx --test tests/discord-transport.integration.mts`
- `npm run build`
- Live acceptance: install in a test server, issue a request with two human attendees, answer a missing-duration prompt, connect both calendars, confirm a proposed slot, and verify one calendar event plus one channel announcement. Check that another attendee cannot confirm the requester's booking.

API references: https://discord.com/developers/docs/interactions/receiving-and-responding and https://discord.com/developers/docs/interactions/application-commands.
