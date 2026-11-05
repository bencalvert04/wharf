// Kept separate from transport and encryption so generation/session races can
// be exercised against PostgreSQL without real provider credentials.
import type {CalendarDatabase} from './calendar-connection-store.ts';
export async function storeProviderGrant(db:CalendarDatabase,s:{id:string;google_sub?:string|null},account:string,provider:'microsoft'|'icloud',encrypted:string,email:string,name:string,generation:string|null){
 const [saved]=await db`WITH active AS MATERIALIZED (
 SELECT id FROM sessions WHERE id=${s.id} AND google_sub IS NOT DISTINCT FROM ${s.google_sub||null}::text AND expires_at>now() FOR UPDATE
 ), saved AS (
 INSERT INTO calendar_provider_connections(account_id,provider,credential,email)
 SELECT ${account},${provider},${encrypted},${email}
 WHERE EXISTS(SELECT 1 FROM active)
 AND (${generation===null} OR EXISTS(SELECT 1 FROM calendar_provider_connections WHERE account_id=${account} AND connection_id=${generation}::uuid))
 ON CONFLICT(account_id) DO UPDATE SET provider=EXCLUDED.provider,credential=EXCLUDED.credential,email=EXCLUDED.email,connection_id=gen_random_uuid(),updated_at=now()
 WHERE calendar_provider_connections.connection_id=${generation}::uuid OR (${generation===null} AND ${s.google_sub==null})
 RETURNING account_id
 ), updated AS (
 UPDATE sessions SET google_sub=${account},name=${name.slice(0,100)},email=${email},picture=NULL
 WHERE id=${s.id} AND google_sub IS NOT DISTINCT FROM ${s.google_sub||null}::text AND EXISTS(SELECT 1 FROM saved) RETURNING id
 ) SELECT (SELECT count(*) FROM updated)::int AS saved`;
 if(!saved.saved)throw Error('Your account or calendar connection changed. Please try again.');
}
