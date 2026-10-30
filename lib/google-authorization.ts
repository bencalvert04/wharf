export const FREE_BUSY_SCOPE='https://www.googleapis.com/auth/calendar.freebusy';
const EVENT_SCOPE='https://www.googleapis.com/auth/calendar.events.owned';
export type GooglePurpose='join'|'connect'|'planner_connect'|'events'|'agent_events';
/** A calendar action requests identity and availability together. Plain login stays identity-only. */
export function googleAuthorization(purpose:GooglePurpose,meetingId:string|null,consentSub:string|null){
 const calendar=!!meetingId||!!consentSub||purpose!=='join';
 return {
  calendar,
  purpose:calendar&&purpose==='join'?'connect' as const:purpose,
  options:{access_type:calendar?'offline' as const:'online' as const,include_granted_scopes:true,
   scope:['openid','profile','email',...(calendar?[FREE_BUSY_SCOPE]:[]),...(['planner_connect','events','agent_events'].includes(purpose)?[EVENT_SCOPE]:[])],
   // Forced consent is recovery for a known missing grant or an event-scope upgrade.
   // First-time linking lets Google show consent only as needed.
   ...(consentSub?{prompt:'consent',login_hint:consentSub}:{})}
 };
}
