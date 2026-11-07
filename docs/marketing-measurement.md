# Marketing measurement

## Release setup

This PR is independent of availability-refresh PR #53. Do not merge #53 as a prerequisite.

1. Run the normal database migration in the isolated staging database. It creates marketing_events, marketing_daily, and counters on requests/attendees. Aggregate counts start at installation, without backfill. No identities or meeting contents are copied into analytics.
2. Set MARKETING_ADMIN_EMAILS to the verified sign-in emails allowed to view /marketing. Ray requested raycshaw36@gmail.com. Ben's email still needs confirmation. Never expose this variable with a NEXT_PUBLIC prefix. Empty means access denied. Sign into Wharf normally before visiting the dashboard.
3. Set MARKETING_ENABLED=true and NEXT_PUBLIC_MARKETING_ENABLED=true in staging and rebuild. Both are false by default. The second value is embedded at build time. Disable both to stop browser collection. Database aggregate triggers remain active after migration.
4. Visit a tagged link, create a non-demo test meeting, join using calendar and manual availability, and finalize using designated test attendees. Check the dashboard, duplicate submissions, and privacy opt-out. Verify unsigned and non-allowlisted accounts get 404. Confirm /api/cleanup removes browser events older than 90 days.
5. Review the analytics privacy text before enabling production collection. Configure production separately, migrate before deployment, and repeat smoke checks. No paid service or external analytics vendor is required.

## What is measured

- Database-confirmed daily meetings created/finalized and newly inserted manual/Google-or-other-calendar/Microsoft participation records. Includes existing integrations. No backfill; later meeting cleanup does not erase aggregate history.
- Browser visits and actions: page viewed, creation attempted/succeeded, attendance started/completed, calendar picker/manual entry opened, invite copied, finalization started/succeeded.
- Campaign source, medium, campaign, placement (UTM content); device-size category; known referring search/social source or generic referral. No full referrer or page URL stored.
- A visit is a tab-local random ID with a 30-minute inactivity timeout. It is not a person, cross-device user, or weekly/monthly active user. Do not label it MAU. No returning-user or retention claims are supported by this implementation.
- Campaign success counts are visits with browser-reported success; they can undercount successful server actions. Daily confirmed totals are intentionally separate. Ratios across same-period created/finalized counts are not cohort conversion rates.
- Join records can count again after leave/rejoin. Updates/refreshes do not count. Demo meetings are excluded. Ordinary manual/calendar join metrics do not identify individuals.

Browser events are untrusted estimates, not billing/security/audit data. Payloads are allowlisted and capped at 2KB; duplicate event IDs are ignored and visits capped at 100 events (best-effort under concurrency). A malicious client can invent visit IDs. Before broad paid campaigns, enable Vercel's appropriate request-rate protection and monitor database writes. No automatic IP collection or fingerprinting is used. Analytics errors do not prevent scheduling.

90-day browser retention uses the existing daily cleanup route even when collection is disabled. Keep the cleanup cron operational. Daily anonymous counters are retained; they contain neither visit nor meeting IDs. Honor DNT, Global Privacy Control, and the local opt-out on /privacy. Blocking storage disables browser tracking. Do not put names/emails in campaign tags.

## Weekly review (Ray + Ben, 20 minutes)

- Record campaign, owner, channel, placement, start date, spend, outreach count and tagged URL in your marketing planning tool.
- Compare visits and creator/attendee visits per placement. Record spend per creator visit only as an estimate, not customer acquisition cost.
- Review confirmed meetings finalized and manual/calendar joins; ask users where setup stalled.
- Test the highest-traffic mobile path. Prioritize one friction fix and one new distribution experiment each week.
- Log each experiment's hypothesis, success measure, result and keep/change/stop decision. Use separate placement tags for each poster, email, club, social post and Slack campaign.
- Review invite delivery failures and application errors through existing operational logs; this dashboard does not expose those private logs or claim emails reached inboxes.

Suggested first links: byu / qr / campus-launch / library-poster; byu / outreach / clubs / club-presidents; instagram / social / campus-launch / demo-reel. The private dashboard builds copyable links for these dimensions.

Future additions after baseline data: explicit organization accounts and paid conversion, organization retention cohorts, trusted cross-session attribution with a consent strategy, campaign spend imports, delivery-provider aggregate webhook metrics, and calendar connection failure categories. Avoid collecting everything before deciding what action a metric supports.
