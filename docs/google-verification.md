# Google verification: recording and reviewer access

Project: `root-engine-512707-n9` (number `364023655800`).
App: https://wharfmeetings.com
Privacy policy: https://wharfmeetings.com/privacy

Status checked in Google Verification Center on November 5, 2026: homepage, privacy policy, branding, and minimum scopes are complete, last reviewed November 4. Data access is still under review. The outstanding app-functionality issue is the OAuth demonstration video. The November 3 email specifically requires expanding the “Services” link so every permission is visible, then replying with the replacement video link. Do not resubmit the already-complete privacy or scope steps unnecessarily.

## Scope mapping

| Requested scope | Feature to demonstrate | Why this access is used |
| --- | --- | --- |
| `openid` | Sign in and return to the same Google identity in Wharf | Identify the participant and bind their session and calendar connection. |
| `profile` (Console: `https://www.googleapis.com/auth/userinfo.profile`) | Display name and account photo in Wharf | Identify the signed-in user and meeting participants. |
| `email` (Console: `https://www.googleapis.com/auth/userinfo.email`) | Invite the joined guest at their verified Google email address | Address native invitations to the account that joined. |
| `https://www.googleapis.com/auth/calendar.freebusy` | A real primary-calendar busy period excludes that time from shared availability | Availability without reading existing event titles, descriptions, locations, or guests. |
| `https://www.googleapis.com/auth/calendar.events.owned` | Confirm a meeting, then show the event in the organizer's primary Google Calendar and the guest invitation | Create the event and read that specific event by its stable ID to recover interrupted requests. Free/busy and read-only scopes cannot create it. `calendar.app.created` only permits this on app-created calendars, not the existing primary calendar. Broader `calendar` and `calendar.events` scopes are unnecessary. |

The code does not request Gmail access. The Gmail-deletion example in Google's email is not a feature Wharf must add or demonstrate. Wharf does not edit or delete existing Google events. Deleting a Wharf meeting does not cancel its Google event.

## Before recording

1. Use dedicated organizer and guest Google accounts with synthetic events and no personal calendar information. Use separate browser profiles so organizer and guest roles are clear. A fresh browser alone does not reset Google consent: use accounts without a previous Wharf grant, or intentionally disconnect a disposable test account first.
2. Put a clearly named test busy event on the guest's primary calendar, inside a future meeting window. Leave another time free on both accounts. Keep timezone labels visible and consistent.
3. Check Google Auth Platform's Data Access page against the scope table above. Include every OAuth client used by the submitted application. The application uses incremental grants, so the guest and organizer permission screens intentionally differ; the full requested scope set must match the Console.
4. Google instructs live apps to demonstrate unverified new scopes in a staging environment or hidden test route. Use a reviewer/test environment for that recording, with the same booking implementation and scope set, and a registered callback URL. Confirm the environment before recording. A Vercel preview URL by itself is insufficient if its callback or application URL points to production. Do not change the production audience to Testing to reset consent.
5. Use English for the consent screens. Record readable browser text and the address bar. Keep passwords, one-time codes, client secrets, refresh tokens, and private invitation credentials out of the recording. Do not show a client secret in the Console.

## Recording sequence

1. Show the Wharf homepage and the privacy link. Open the policy briefly and show the data-sharing and data-protection sections. Explain that Wharf finds shared availability and creates a confirmed meeting on the organizer's primary calendar.
2. Show identity-only sign-in if demonstrating the standalone account Sign in entry point. Expand all Google permission details, finish the flow, and show the resulting account name/photo in Wharf.
3. As the organizer, choose **Create a meeting**, enter a clear test title, future dates, hours, duration, and timezone, then choose **Connect Google & create**. Show the in-app connection explanation and continue through the complete Google flow. Expand **Show all services** or equivalent details so identity, availability, and owned-event permissions are readable. Show any expected unverified-app notice rather than editing the consent process out. Pause long enough to read each screen.
4. Copy the invitation link and open it in the guest's separate browser. Choose **I'm attending** and connect the guest's Google Calendar. Show the complete guest consent screen, including availability access and the absence of a newly requested event-write permission. Return to Wharf and show the guest's name and shared availability.
5. Show the guest's real test busy event in Google Calendar and the corresponding unavailable interval in Wharf. Explain that the application reads busy intervals, not the test event's title or description. Use real test accounts, not **View example** sample calendars, for this evidence.
6. Return to the organizer, choose a shared future slot, and click **Create meeting**. Show the successful creation state and **Open in Google Calendar**. If the organizer has not granted event access, include the separate event-permission upgrade flow, fully expanded, before confirming creation. Existing flows may reuse a saved grant, so prepare a test account that actually displays each permission flow you need to demonstrate.
7. In the organizer's Google Calendar, open the created event and show its title, time, timezone, primary-calendar location, and guest list. In the guest account, show the corresponding invitation and RSVP option. Explain that guest settings control whether the invitation appears automatically or after acceptance. This source-account evidence is essential; Wharf's success message alone is insufficient.
8. Demonstrate the submitted Slack/agent integration too. In a prepared test Slack conversation, mention Wharf with a future date, time range, and duration; show participants connecting through their private prompts or shared meeting link. Show the organizer's meeting-specific authorization page and **Allow calendar invitations** when that flow is used, including any Google consent. Confirm booking using the supported Slack action, then show the resulting Google event and invitations. For a separate agent client, show its organizer authorization and booking flow as well. Clearly distinguish Wharf's one-meeting agent authorization from Google's account-level OAuth grant.
9. Explain the narrower-scope reasoning from the table while showing event creation. Do not claim Google grants create-only permission: the scope's capability includes read/change/delete on owned calendars, while Wharf limits its implemented operations to the described booking behavior.

Google requires all OAuth entry points and the maximum extent of the submitted user-facing Google features. Include the standalone connection, organizer upgrade, and agent-authorization flows if they are part of the submitted app, even if the normal combined flow skips an extra consent page for a returning account. Do not invent a delete demonstration for an operation Wharf does not perform.

## Reviewer navigation and access

The public browser workflow has no separate Wharf username/password, payment step, phone-verification step, or invitation-only account requirement. It uses Google sign-in. Reviewers can open the homepage, choose Create a meeting, supply future dates and hours, connect Google, share the link with a second test account, join from that account, then select a shared time as the organizer and create the Google event.

For the reply, explicitly state that ordinary browser review uses Google sign-in and no local Wharf password. If Google needs a prepared account or the Slack/agent environment, provide dedicated authorized reviewer access privately, outside this repository and video. Verify the exact access path first, including workspace membership, enabled Slack conversation, and account challenges. Do not disable security on personal accounts. No reviewer credential or prepared Slack access is supplied by this document.

## Submission after recording

1. Upload the replacement video to YouTube as **Unlisted** or **Public**. Verify that someone signed out can watch it.
2. Replace the old video URL in Google Auth Platform > Data Access. Confirm the justification matches the current combined consent flow: organizer event access can be granted while connecting, but event creation happens only after meeting confirmation. Keep the existing scope set.
3. The branding privacy URL should remain `https://wharfmeetings.com/privacy`. Useful direct links are `/privacy#data-sharing` and `/privacy#data-protection`.
4. Follow the Verification Center's current instructions to continue the existing review. Reply to the latest November 3 email in the existing verification thread with the policy URL, the new video URL, timestamps for consent and source-calendar evidence, the reviewer navigation steps, and any required private test-access information. Do not claim the demo is complete until the replacement is accessible.

## Sources

- [Google privacy policy requirements](https://support.google.com/cloud/answer/13806988)
- [Google demo video requirements](https://support.google.com/cloud/answer/13804565)
- [Google Calendar scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Google Calendar event insertion](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
- [Neon security mechanisms](https://neon.com/docs/security/security-overview)
