import type {CalendarDatabase} from './calendar-connection-store.ts';
export const isStandaloneProviderAccount=(account:unknown)=>typeof account==='string'&&/^(microsoft|icloud):/.test(account);

// This protects observed generations, not a globally ordered user-intent log.
// Snapshot persistence and this check are separate statements; callers must not
// claim an atomic guarantee against a switch in that final narrow interval.
export async function captureGoogleSwitch(db:CalendarDatabase,account:string,sessionId:string,sessionAccount:string|null){
 const [connection]=await db`SELECT connection_id FROM calendar_provider_connections WHERE account_id=${account}`;
 const generation=connection?.connection_id||null;
 const check=async(expected=sessionAccount)=>{
  const [current]=await db`SELECT s.id FROM sessions s WHERE s.id=${sessionId} AND s.google_sub IS NOT DISTINCT FROM ${expected}::text AND s.expires_at>now()
   AND (SELECT connection_id FROM calendar_provider_connections WHERE account_id=${account}) IS NOT DISTINCT FROM ${generation}::uuid`;
  if(!current)throw Error('Your account or calendar connection changed. Please try again.');
 };
 return {check,remove:async(expected=sessionAccount)=>{
  await check(expected);
  if(generation){
   const [deleted]=await db`DELETE FROM calendar_provider_connections WHERE account_id=${account} AND connection_id=${generation}::uuid RETURNING account_id`;
   if(!deleted)throw Error('Your calendar connection changed. Please try again.');
  }
 }};
}
