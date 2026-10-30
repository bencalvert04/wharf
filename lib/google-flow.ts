import {googleAuthorization,type GooglePurpose} from './google-authorization';
import {createHash} from 'node:crypto';
import {sql,token,hash} from './auth';
import {google,challengeMethod} from './google';
import {prepareCalendarConsent} from './calendar-connection';
import {tokenVaultConfigured} from './token-vault';

export async function beginGoogleFlow(sessionId:string,meetingId:string|null,returnMeetingId:string|null=null,consentSub:string|null=null,inviteeId:string|null=null,purpose:GooglePurpose='join',slackAttendanceId:string|null=null){
 const authorization=googleAuthorization(purpose,meetingId,consentSub);
 if(authorization.calendar&&!tokenVaultConfigured())throw Error('Google token encryption is not configured.');
 const generation=consentSub?await prepareCalendarConsent(consentSub):null;
 const state=token(),verifier=token(),nonce=token();
 await sql()`INSERT INTO oauth_states(id,session_id,meeting_id,verifier,nonce,expires_at,return_meeting_id,expected_sub,connection_version,invitee_id,purpose,slack_attendance_id,connection_id)
  VALUES(${hash(state)},${sessionId},${meetingId},${verifier},${nonce},now()+interval '10 minutes',${returnMeetingId},${consentSub},${generation?.version??null},${inviteeId},${authorization.purpose},${slackAttendanceId},${generation?.connectionId??null})`;
 return google().generateAuthUrl({...authorization.options,
  state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:challengeMethod});
}
