import type {sql} from './auth';
export type CalendarDatabase=ReturnType<typeof sql>;
export type CalendarGeneration={version:number;connectionId:string};

export async function prepareCalendarConnection(db:CalendarDatabase,sub:string):Promise<CalendarGeneration>{
 await db`INSERT INTO google_calendar_connections(google_sub) VALUES(${sub}) ON CONFLICT DO NOTHING`;
 const [row]=await db`SELECT * FROM google_calendar_connections WHERE google_sub=${sub}`;
 if(!row||row.disconnecting)throw Error('Calendar disconnection is pending.');
 return {version:Number(row.version),connectionId:row.connection_id};
}
export async function storeCalendarGrant(db:CalendarDatabase,sub:string,encryptedToken:string,generation:CalendarGeneration,scopes:string){
 const [row]=await db`UPDATE google_calendar_connections SET refresh_token=${encryptedToken},granted_scopes=${scopes},updated_at=now()
  WHERE google_sub=${sub} AND version=${generation.version} AND connection_id=${generation.connectionId||null}::uuid AND NOT disconnecting RETURNING google_sub`;
 if(!row)throw Error('Calendar connection changed. Please try again.');
}
export async function disconnectCalendarConnection(db:CalendarDatabase,sub:string,revoke:(encryptedToken:string,signal:AbortSignal)=>Promise<void>){
 const deadline=Date.now()+10000,signal=AbortSignal.timeout(10000);
 // Block new use first. Keep the encrypted token on provider failure so revocation
 // can be retried. Only delete the exact generation that was successfully revoked.
 const [row]=await db`UPDATE google_calendar_connections SET disconnecting=true,version=version+1,updated_at=now()
  WHERE google_sub=${sub} AND (NOT disconnecting OR updated_at<now()-interval '30 seconds') RETURNING *`;
 if(!row){
  const [pending]=await db`SELECT google_sub FROM google_calendar_connections WHERE google_sub=${sub}`;
  if(pending)throw Error('Calendar disconnection is already in progress. Please retry shortly.');
  return;
 }
 await db`DELETE FROM oauth_states WHERE expected_sub=${sub} AND (connection_id=${row.connection_id}::uuid OR connection_id IS NULL)`;
 try{
  if(row.refresh_token){
   // The deadline starts before DB work, not after it: a stalled claim must
   // never start provider revocation after a later attempt could take over.
   const [owned]=await db`SELECT google_sub FROM google_calendar_connections
    WHERE google_sub=${sub} AND connection_id=${row.connection_id}::uuid AND version=${row.version} AND disconnecting`;
   if(!owned)throw Error('Calendar disconnection claim changed. Please retry.');
   if(Date.now()>=deadline)throw Error('Calendar disconnection timed out. Please retry.');
   signal.throwIfAborted();
   await revoke(row.refresh_token,signal);
  }
 }catch(error){
  // Let a confirmed failed attempt retry immediately; an abandoned worker's
  // claim expires after 30 seconds (provider calls time out after 10 seconds).
  await db`UPDATE google_calendar_connections SET updated_at=now()-interval '30 seconds'
   WHERE google_sub=${sub} AND connection_id=${row.connection_id}::uuid AND version=${row.version} AND disconnecting`;
  throw error;
 }
 const [deleted]=await db`DELETE FROM google_calendar_connections
  WHERE google_sub=${sub} AND connection_id=${row.connection_id}::uuid AND version=${row.version} AND disconnecting RETURNING google_sub`;
 if(!deleted)throw Error('Calendar connection changed during disconnection. Check your account and retry if needed.');
}
