# Slack scheduling interpretation

`SLACK_INTERPRETER=jev` enables the Jev path. `TYPESAFE_API_KEY` is server-only. Haiku remains available through the existing Anthropic key for short conversational replies and confirmation wording. Leave the flag unset to roll back to the previous interpreter.

An @Wharf request reads bounded recent history in parallel with the saved requester context. The server extracts literal date, clock, duration, title and timezone candidates. Leading duration/deadline shorthand such as “15 minutes after 8 pm” is normalized as a 15-minute meeting after 8 pm. One TypeSafe System One call chooses intent and relevant candidates. Jev does not generate arbitrary API arguments, perform date arithmetic, read calendar events, choose participants or call booking tools.

Code resolves calendar dates in the requested timezone, validates the draft using the public API's schema, and applies the default 05:00 to 23:00 limits. Explicit clock endpoints can override overnight limits. A bare day is not a complete time window. Missing details use the existing duration and time preset buttons, including Other. Requests and follow-ups retain their original timestamps so relative dates survive midnight.

Direct details require a choice probability of at least 0.7. History-only details and tentative scheduling intent can form a proposal at 0.6, but always require confirmation. “Next Tuesday” also requires confirmation when it differs from the coming Tuesday. Booking intent separately requires an explicit-booking judgment of at least 0.85. Provider failures do not produce a draft.

A confirmation stores the validated draft in `slack_context.proposal`. The button contains only its random ID and thread. Both loading and insertion check workspace, channel, requester, thread, current proposal ID and a one-day expiry. A correction invalidates the old proposal. Insertion locks the matching context and remains idempotent through the meeting's unique channel/thread constraint. Existing planner, calendar authorization and slot revalidation checks still govern booking.

Jev has a four-second timeout. Haiku has a 2.5-second timeout, 100-token output cap and no tools; its failure falls back to preset text. Usual complete requests do not call Haiku. Logs include provider latency and token counts, never prompts or credentials. The existing daily workspace cap remains in place.

## Validation

Run `npm test` and `npm run build` with Node 22. Unit coverage includes temporal bounds, source provenance, correction precedence, relative-date anchoring, low confidence, provider failures, proposal authorization, expiry and duplicate confirmation clicks. Live model probes must use synthetic messages and an explicitly approved spending budget. Their ignored local ledger and results live under `.wharf-agent/`.

Migration: `ALTER TABLE slack_context ADD COLUMN IF NOT EXISTS proposal jsonb` (also included in `scripts/migrate.mjs`). Apply before enabling the new deployment.
