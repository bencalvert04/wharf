import {EVENT_SCOPE} from './google-event-payload';
import {createHash} from 'node:crypto';
import {sql,token,hash} from './auth';
import {google,challengeMethod} from './google';
import {prepareCalendarConsent} from './calendar-connection';
import {tokenVaultConfigured} from './token-vault';

export async function beginGoogleFlow(sessionId:string,meetingId:string|null,returnMeetingId:string|null=null,consentSub:string|null=null,inviteeId:string|null=null,purpose:'join'|'events'|'agent_events'='join',slackAttendanceId:string|null=null){
 if(consentSub&&!tokenVaultConfigured())throw Error('Google token encryption is not configured.');
 const version=consentSub?await prepareCalendarConsent(consentSub):null;
 const state=token(),verifier=token(),nonce=token();
 await sql()`INSERT INTO oauth_states(id,session_id,meeting_id,verifier,nonce,expires_at,return_meeting_id,expected_sub,connection_version,invitee_id,purpose,slack_attendance_id)
  VALUES(${hash(state)},${sessionId},${meetingId},${verifier},${nonce},now()+interval '10 minutes',${returnMeetingId},${consentSub},${version},${inviteeId},${purpose},${slackAttendanceId})`;
 // Identify signed-out attendees first so returning users can reuse the saved grant.
 // Request offline consent only when there is no usable connection for that identity.
 return google().generateAuthUrl({access_type:consentSub?'offline':'online',
  include_granted_scopes:true,
  scope:['openid','profile','email',...(consentSub?['https://www.googleapis.com/auth/calendar.freebusy',...(purpose!=='join'?[EVENT_SCOPE]:[])]:[])],
  ...(consentSub?{prompt:'consent',login_hint:consentSub}: {prompt:'select_account'}),
  state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:challengeMethod});
}
