import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {queueAgentBooking} from '../lib/agent-booking.ts';
import {completeAgentCalendarAuthorization} from '../lib/agent-calendar-authorization.ts';
import {persistCalendarSnapshot,withdrawSnapshot} from '../lib/meeting-participation.ts';
import {sealToken} from '../lib/token-vault.ts';
const db=neon(process.env.DATABASE_URL),base=process.env.TEST_URL||'http://127.0.0.1:3007';
const ids=[],sessions=[],subs=[],key=randomBytes(32).toString('base64url');
const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
const body={title:'Synthetic agent booking',startDate:date,timezone:'UTC',durationMinutes:45,participants:[{id:'planner',name:'Planner'},{id:'guest',name:'Guest'}]};
async function api(path,body,token=key){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Idempotency-Key':'booking-'+key},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()}}
async function person(id,participant){const raw=randomBytes(32).toString('base64url'),sid=createHash('sha256').update(raw).digest('hex'),sub='synthetic-book-'+randomUUID();sessions.push(sid);subs.push(sub);await db`INSERT INTO sessions(id,google_sub,email,expires_at) VALUES(${sid},${sub},${participant+'@example.com'},now()+interval '1 hour')`;await persistCalendarSnapshot(id,sub,participant,[],sid,participant);return {sid,sub,cookie:'wharf_session='+raw}}
try{
 const created=await api('/api/v1/meetings',body);assert.equal(created.status,201,JSON.stringify(created.data));const id=created.data.id;ids.push(id);const path='/api/v1/meetings/'+id;
 assert.equal((await api(path+'/calendar',{organizerParticipantId:'planner'})).data.error.code,'organizer_not_joined');
 const planner=await person(id,'planner'),guest=await person(id,'guest');
 const prepared=await api(path+'/calendar',{organizerParticipantId:'planner'});assert.equal(prepared.status,200);assert.equal(prepared.data.authorized,false);
 assert.equal((await api(path+'/calendar',{organizerParticipantId:'guest'})).data.error.code,'organizer_already_selected');
 const authUrl=new URL(prepared.data.authorizationUrl),token=authUrl.searchParams.get('token');
 const requestAuth=(cookie,origin=base)=>fetch(base+'/api/agent/calendar/authorize',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({meetingId:id,token})});
 assert.equal((await requestAuth(guest.cookie)).status,403);assert.equal((await requestAuth(planner.cookie,'https://evil.example')).status,403);
 assert.equal((await fetch(base+'/api/agent/calendar/authorize?meeting='+id+'&token=wrong')).status,404);
 const slots=(await api(path+'/slots')).data,choice={slotId:slots.slots[0].id,revision:slots.revision};
 assert.equal((await api(path+'/book',choice)).data.error.code,'calendar_authorization_required');
 assert.equal((await db`SELECT final_time FROM requests WHERE id=${id}`)[0].final_time,null);
 const consent=await requestAuth(planner.cookie),consentBody=await consent.json();assert.equal(consent.status,200,JSON.stringify(consentBody));const googleUrl=new URL(consentBody.url);assert.ok(googleUrl.searchParams.get('scope').includes('calendar.events.owned'));
 const [flow]=await db`SELECT * FROM oauth_states WHERE session_id=${planner.sid}`;assert.equal(flow.purpose,'agent_events');assert.equal(flow.expected_sub,planner.sub);assert.equal(flow.invitee_id,'planner');
 await assert.rejects(()=>completeAgentCalendarAuthorization(flow,{sub:guest.sub},{scope:'https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events.owned',refresh_token:'synthetic'}));
 await assert.rejects(()=>completeAgentCalendarAuthorization(flow,{sub:planner.sub},{scope:'https://www.googleapis.com/auth/calendar.freebusy',refresh_token:'synthetic'}));
 await completeAgentCalendarAuthorization(flow,{sub:planner.sub},{scope:'https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events.owned',refresh_token:'synthetic-never-sent'});
 assert.equal((await api(path)).data.calendarAuthorization.authorized,true);
 // A revoked grant must show the approval button again, even though meeting consent was saved.
 await db`UPDATE google_calendar_connections SET refresh_token=NULL,granted_scopes=NULL,version=version+1 WHERE google_sub=${planner.sub}`;
 const renewView=await fetch(base+'/api/agent/calendar/authorize?'+authUrl.searchParams,{headers:{Cookie:planner.cookie}}).then(r=>r.json());assert.equal(renewView.authorized,false);
 assert.equal((await api(path+'/calendar',{organizerParticipantId:'planner'})).data.authorized,false);
 const renewal=await requestAuth(planner.cookie);assert.equal(renewal.status,200);assert.ok((await renewal.json()).url);
 const [renewFlow]=await db`SELECT * FROM oauth_states WHERE session_id=${planner.sid} ORDER BY connection_version DESC LIMIT 1`;
 await completeAgentCalendarAuthorization(renewFlow,{sub:planner.sub},{scope:'https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events.owned',refresh_token:'synthetic-never-sent'});
 await persistCalendarSnapshot(id,guest.sub,'Guest',[],guest.sid,'guest');
 assert.equal((await api(path+'/book',choice)).data.error.code,'stale_revision');
 const fresh=(await api(path+'/slots')).data,chosen={slotId:fresh.slots[0].id,revision:fresh.revision};
 const results=await Promise.all([queueAgentBooking(id,key,chosen),queueAgentBooking(id,key,chosen)]);assert.equal(results.length,2);
 const jobs=await db`SELECT * FROM google_meeting_events WHERE meeting_id=${id}`;assert.equal(jobs.length,1);assert.equal(jobs[0].payload.attendees.length,1);assert.equal(jobs[0].payload.attendees[0].email,'guest@example.com');
 assert.equal((await db`SELECT * FROM invitation_outbox WHERE meeting_id=${id}`).length,0);
 await assert.rejects(()=>withdrawSnapshot(id,planner.sub));await assert.rejects(()=>persistCalendarSnapshot(id,guest.sub,'Guest',[],guest.sid,'guest'));
 // Hold the delivery lease, so HTTP retries exercise pending handling without contacting Google.
 await db`UPDATE google_meeting_events SET lease_until=now()+interval '10 minutes' WHERE meeting_id=${id}`;
 const retry=await api(path+'/book',chosen);assert.equal(retry.status,200,JSON.stringify(retry.data));assert.equal(retry.data.calendar.status,'pending');assert.equal(retry.data.calendarEventCreated,false);assert.equal(retry.data.nextAction.type,'retry_booking');
 // Simulate provider acceptance. Real provider transport is tested with fake clients in unit tests.
 await db`UPDATE google_meeting_events SET delivered_at=now(),html_link='https://calendar.google.com/calendar/event?eid=synthetic' WHERE meeting_id=${id}`;
 const delivered=await api(path+'/book',chosen);assert.equal(delivered.status,200);assert.equal(delivered.data.calendarEventCreated,true);assert.equal(delivered.data.nextAction.type,'done');
 assert.equal((await api(path+'/book',{...chosen,slotId:'wrong'})).data.error.code,'already_finalized');
 const text=JSON.stringify(delivered.data);assert.ok(!text.includes(planner.sub));assert.ok(!text.includes('planner@example.com'));assert.ok(!text.includes('synthetic-never-sent'));
 // Existing save-only finalizations can be upgraded, using the original choice/revision.
 const key2=randomBytes(32).toString('base64url'),other=await api('/api/v1/meetings',body,key2),id2=other.data.id;ids.push(id2);const path2='/api/v1/meetings/'+id2;
 const planner2=await person(id2,'planner');await person(id2,'guest');await api(path2+'/calendar',{organizerParticipantId:'planner'},key2);
 await db`INSERT INTO google_calendar_connections(google_sub,refresh_token,granted_scopes) VALUES(${planner2.sub},${sealToken('synthetic',planner2.sub)},'https://www.googleapis.com/auth/calendar.events.owned')`;
 await db`UPDATE agent_calendar_authorizations SET authorized_sub=${planner2.sub},authorized_at=now() WHERE meeting_id=${id2}`;
 const slots2=(await api(path2+'/slots',null,key2)).data,choice2={slotId:slots2.slots[0].id,revision:slots2.revision};
 assert.equal((await api(path2+'/finalize',choice2,key2)).status,200);await queueAgentBooking(id2,key2,choice2);assert.equal((await db`SELECT * FROM google_meeting_events WHERE meeting_id=${id2}`).length,1);
 console.log('Agent booking passed: organizer-only consent, partial-scope rejection, stale revisions, atomic concurrent booking, frozen roster, pending/delivered retries, privacy, legacy save-only upgrade. No provider events or messages sent.');
}finally{for(const sid of sessions)await db`DELETE FROM oauth_states WHERE session_id=${sid}`;for(const id of ids)await db`DELETE FROM requests WHERE id=${id}`;for(const sid of sessions)await db`DELETE FROM sessions WHERE id=${sid}`;for(const sub of subs)await db`DELETE FROM google_calendar_connections WHERE google_sub=${sub}`}
