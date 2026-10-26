import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pendingMeetingSchema} from '../db/pending-meeting-schema.mjs';
import {pendingMeetings,recordMeetingVisit,rememberedInvitation,dismissPendingMeeting,type PendingDatabase} from '../lib/pending-meeting-store.ts';

async function fixture(){
 const database=new PGlite();
 const constraints=JSON.stringify({title:'Planning',start:'2026-10-26',end:'2026-10-30',duration:30,zone:'UTC',from:'09:00',to:'17:00',days:[1,2,3,4,5]});
 await database.exec(`CREATE TABLE requests(id text PRIMARY KEY,constraints text NOT NULL,created_at text NOT NULL,owner_session text,planner_name text,final_time jsonb,revision integer DEFAULT 0);
 CREATE TABLE sessions(id text PRIMARY KEY,name text);
 CREATE TABLE attendees(meeting_id text REFERENCES requests(id) ON DELETE CASCADE,google_sub text,name text,email text,busy jsonb,captured_at timestamptz DEFAULT now(),PRIMARY KEY(meeting_id,google_sub));
 CREATE TABLE request_invitees(meeting_id text REFERENCES requests(id) ON DELETE CASCADE,id text,name text,google_sub text,PRIMARY KEY(meeting_id,id));
 INSERT INTO sessions VALUES('planner','Planner'),('outsider','Outsider');`);
 await database.query("INSERT INTO requests(id,constraints,created_at,owner_session) VALUES($1,$2,(now()-interval '8 days')::text,$3)",['meeting',constraints,'planner']);
 await database.exec("INSERT INTO attendees(meeting_id,google_sub,name,busy) VALUES('meeting','member','Member','[]')");
 for(const statement of pendingMeetingSchema)await database.exec(statement);
 const db=(async(strings:TemplateStringsArray,...values:unknown[])=>{
  const query=strings.reduce((out,part,index)=>out+(index?'$'+index:'')+part,'');
  return (await database.query(query,values)).rows;
 }) as unknown as PendingDatabase;
 return {database,db};
}
test('leaving retains pending membership but removes calendar data; rejoining restores attendance',async()=>{
 const {database,db}=await fixture();
 try{
  assert.equal((await pendingMeetings(db,'member-session','member'))[0].joined,true);
  await database.exec("DELETE FROM attendees WHERE meeting_id='meeting' AND google_sub='member'");
  const left=await pendingMeetings(db,'member-session','member');assert.equal(left.length,1);assert.equal(left[0].joined,false);assert.equal(left[0].known_participant,true);
  assert.deepEqual((await database.query('SELECT * FROM attendees')).rows,[]);
  await database.exec("INSERT INTO attendees(meeting_id,google_sub,name,busy) VALUES('meeting','member','Member','[]')");
  assert.equal((await pendingMeetings(db,'member-session','member'))[0].joined,true);
  assert.equal((await database.query('SELECT * FROM meeting_memberships')).rows.length,1);
  assert.equal((await pendingMeetings(db,'outsider',null)).length,0);
 }finally{await database.close()}
});
test('finalized requests disappear for planners and former attendees',async()=>{
 const {database,db}=await fixture();
 try{
  await database.exec("DELETE FROM attendees;UPDATE requests SET final_time='{"+'"start":1,"end":2'+"}'::jsonb");
  assert.equal((await pendingMeetings(db,'planner',null)).length,0);
  assert.equal((await pendingMeetings(db,'member-session','member')).length,0);
  assert.equal((await recordMeetingVisit(db,'meeting','member-session','member')).length,0);
 }finally{await database.close()}
});
test('one-week inactivity hides requests; passive list reads do not extend activity',async()=>{
 const {database,db}=await fixture();
 try{
  await database.exec("UPDATE requests SET last_activity_at=now()-interval '7 days'");
  assert.equal((await pendingMeetings(db,'planner',null)).length,0);
  const before=(await database.query('SELECT last_activity_at FROM requests')).rows[0];
  await pendingMeetings(db,'member-session','member');
  assert.deepEqual((await database.query('SELECT last_activity_at FROM requests')).rows[0],before);
  assert.equal((await recordMeetingVisit(db,'meeting','outsider','unknown')).length,0);
  assert.equal((await recordMeetingVisit(db,'meeting','member-session','member')).length,1);
  assert.equal((await pendingMeetings(db,'planner',null)).length,1);
 }finally{await database.close()}
});
test('retained invitations cannot reclaim a roster position claimed by someone else',async()=>{
 const {database,db}=await fixture();
 try{
  await database.exec("INSERT INTO request_invitees VALUES('meeting','slot','Member','member');DELETE FROM attendees;UPDATE request_invitees SET google_sub=NULL");
  assert.equal((await rememberedInvitation(db,'meeting','member'))[0].id,'slot');
  assert.equal((await rememberedInvitation(db,'meeting','outsider')).length,0);
  await database.exec("UPDATE request_invitees SET google_sub='other'");
  assert.equal((await rememberedInvitation(db,'meeting','member')).length,0);
 }finally{await database.close()}
});
test('deleting a meeting cascades membership history without the leave trigger recreating it',async()=>{
 const {database}=await fixture();
 try{
  await database.exec("DELETE FROM requests WHERE id='meeting'");
  assert.deepEqual((await database.query('SELECT * FROM meeting_memberships')).rows,[]);
 }finally{await database.close()}
});
test('the migration is repeatable and uses existing calendar-capture activity for old requests',async()=>{
 const {database,db}=await fixture();
 try{
  for(const statement of pendingMeetingSchema)await database.exec(statement);
  assert.equal((await database.query('SELECT * FROM meeting_memberships')).rows.length,1);
  assert.equal((await pendingMeetings(db,'planner',null)).length,1);
  const activity=await database.query<{last_activity_at:Date;created_at:string}>('SELECT last_activity_at,created_at FROM requests');
  assert.ok(new Date(activity.rows[0].last_activity_at).getTime()>Date.parse(activity.rows[0].created_at)+7*86400000);
  await database.exec("UPDATE requests SET last_activity_at=now()-interval '8 days';UPDATE requests SET revision=revision+1");
  assert.equal((await pendingMeetings(db,'planner',null)).length,1);
 }finally{await database.close()}
});

test('personal removal persists across sessions without leaving or hiding others’ cards',async()=>{
 const {database,db}=await fixture();
 try{
  assert.equal((await dismissPendingMeeting(db,'meeting','member-session','member')).length,1);
  assert.equal((await pendingMeetings(db,'member-session','member')).length,0);
  assert.equal((await pendingMeetings(db,'another-session','member')).length,0);
  assert.equal((await pendingMeetings(db,'planner',null)).length,1);
  assert.equal((await database.query('SELECT * FROM attendees')).rows.length,1);
  await database.exec("UPDATE requests SET revision=revision+1");
  assert.equal((await pendingMeetings(db,'member-session','member')).length,0);
  for(const statement of pendingMeetingSchema)await database.exec(statement);
  assert.equal((await pendingMeetings(db,'member-session','member')).length,0);
 }finally{await database.close()}
});
test('only the current identity is restored by a deliberate visit',async()=>{
 const {database,db}=await fixture();
 try{
  await dismissPendingMeeting(db,'meeting','member-session','member');
  await dismissPendingMeeting(db,'meeting','planner',null);
  assert.equal((await dismissPendingMeeting(db,'meeting','outsider','unknown')).length,0);
  assert.equal((await recordMeetingVisit(db,'meeting','outsider','unknown')).length,0);
  await recordMeetingVisit(db,'meeting','another-session','member');
  assert.equal((await pendingMeetings(db,'another-session','member')).length,1);
  assert.equal((await pendingMeetings(db,'planner',null)).length,0);
  await database.exec("DELETE FROM requests WHERE id='meeting'");
  assert.deepEqual((await database.query('SELECT * FROM pending_meeting_dismissals')).rows,[]);
 }finally{await database.close()}
});
test('signed-in removals do not affect another account in the same browser',async()=>{
 const {database,db}=await fixture();
 try{
  await database.exec("INSERT INTO attendees(meeting_id,google_sub,name,busy) VALUES('meeting','other','Other','[]')");
  await dismissPendingMeeting(db,'meeting','same-browser','member');
  assert.equal((await pendingMeetings(db,'same-browser','member')).length,0);
  assert.equal((await pendingMeetings(db,'same-browser','other')).length,1);
 }finally{await database.close()}
});
test('rejoining clears only the rejoining participant’s personal removal',async()=>{
 const {database,db}=await fixture();
 try{
  await dismissPendingMeeting(db,'meeting','member-session','member');
  await dismissPendingMeeting(db,'meeting','planner',null);
  await database.exec("DELETE FROM attendees;INSERT INTO attendees(meeting_id,google_sub,name,busy) VALUES('meeting','member','Member','[]')");
  assert.equal((await pendingMeetings(db,'member-session','member'))[0].joined,true);
  assert.equal((await pendingMeetings(db,'planner',null)).length,0);
 }finally{await database.close()}
});
