import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {marketingSchema} from '../db/marketing-schema.mjs';
import {parseMarketingEvent,campaignTag,marketingAdmin} from '../lib/marketing/events.ts';
test('marketing rejects arbitrary properties, identifiers and unauthorized dashboard identities',()=>{
 assert.equal(marketingAdmin('ray@example.com',undefined),false);
 assert.equal(marketingAdmin('ray@example.com',' other@example.com, RAY@example.com '),true);
 assert.equal(marketingAdmin('attacker@example.com','ray@example.com'),false);
 assert.equal(campaignTag('person@example.com'),'');assert.equal(campaignTag('https://secret.example/meeting?id=1'),'');
 const raw={id:'12345678-1234-1234-1234-123456789012',visit:'12345678-1234-1234-1234-123456789012',event:'page_view',view:'home',source:'BYU',email:'private@example.com',meeting:'secret'};
 const event=parseMarketingEvent(raw)!;assert.equal(event.source,'byu');assert.equal('email' in event,false);assert.equal('meeting' in event,false);
 assert.equal(parseMarketingEvent({...raw,event:'arbitrary-event'}),null);assert.equal(parseMarketingEvent({...raw,id:'bad'}),null);
});
test('product counters survive meeting deletion and count only first finalization and inserted attendance',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`CREATE TABLE requests(id text PRIMARY KEY,constraints text,final_time jsonb); CREATE TABLE attendees(meeting_id text REFERENCES requests(id) ON DELETE CASCADE,google_sub text,busy jsonb,PRIMARY KEY(meeting_id,google_sub));`);
 for(const statement of marketingSchema)await db.exec(statement);
 await db.exec(`INSERT INTO requests VALUES('real','{}',NULL),('demo','{"demo":true}',NULL); INSERT INTO attendees VALUES('real','manual:a','[]'),('real','google:a','[]'),('demo','manual:b','[]'); UPDATE attendees SET busy='[{"start":1,"end":2}]'; UPDATE requests SET final_time='{"start":1}' WHERE id='real'; UPDATE requests SET final_time='{"start":1}' WHERE id='real'; DELETE FROM requests WHERE id='real';`);
 const rows=await db.query<{metric:string;value:number}>('SELECT metric,value::int FROM marketing_daily');
 assert.deepEqual(Object.fromEntries(rows.rows.map(r=>[r.metric,r.value])),{meetings_created:1,manual_joins:1,calendar_joins:1,meetings_finalized:1});
 for(const statement of marketingSchema)await db.exec(statement);
 assert.equal((await db.query('SELECT * FROM marketing_daily')).rows.length,4);
 }finally{await db.close()}
});
