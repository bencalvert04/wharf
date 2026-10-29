import {storeProviderGrant} from './provider-connection-store';
import {sql} from './auth';
import {openToken,sealToken} from './token-vault';
import {microsoftTokens,microsoftAvailability} from './microsoft-calendar';
import {icloudAvailability,type AppleCredential} from './icloud-calendar';
import type {Constraints} from './availability';
export type CalendarProvider='google'|'microsoft'|'icloud';
export const providerLabel=(provider:CalendarProvider)=>({google:'Google Calendar',microsoft:'Outlook Calendar',icloud:'iCloud Calendar'})[provider];
export async function providerConnection(account:string){
 const [row]=await sql()`SELECT * FROM calendar_provider_connections WHERE account_id=${account}`;
 return row||null;
}
export async function prepareProviderConnection(account:string,provider:'microsoft'|'icloud'){
 await sql()`INSERT INTO calendar_provider_connections(account_id,provider) VALUES(${account},${provider}) ON CONFLICT DO NOTHING`;
 const [row]=await sql()`UPDATE calendar_provider_connections SET connection_id=gen_random_uuid(),updated_at=now() WHERE account_id=${account} RETURNING connection_id`;
 return row.connection_id as string;
}
export async function storeProviderConnection(s:any,account:string,provider:'microsoft'|'icloud',credential:string,email:string,name:string,generation:string|null){
 await storeProviderGrant(sql(),s,account,provider,sealToken(credential,account),email,name,generation);
}
export async function readProviderAvailability(account:string,c:Constraints){
 const connection=await providerConnection(account);
 if(!connection?.credential)throw Error('Reconnect your calendar.');
 const credential=openToken(connection.credential,account);
 let busy;
 if(connection.provider==='microsoft'){
  const tokens=await microsoftTokens({grant_type:'refresh_token',refresh_token:credential});
  if(tokens.refresh_token)await sql()`UPDATE calendar_provider_connections SET credential=${sealToken(tokens.refresh_token,account)},updated_at=now() WHERE account_id=${account} AND connection_id=${connection.connection_id}::uuid AND credential=${connection.credential}`;
  busy=await microsoftAvailability(tokens.access_token,c);
 }else busy=await icloudAvailability(JSON.parse(credential) as AppleCredential,c);
 const current=await providerConnection(account);
 if(!current?.credential||current.connection_id!==connection.connection_id)throw Error('Calendar disconnected while reading availability.');
 return busy;
}
export async function disconnectProvider(account:string){
 const [row]=await sql()`DELETE FROM calendar_provider_connections WHERE account_id=${account} RETURNING account_id`;
 await sql()`DELETE FROM calendar_provider_states WHERE expected_account=${account}`;
 return !!row;
}
