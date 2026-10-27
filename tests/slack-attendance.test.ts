import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canAttendSlackMeeting} from '../lib/slack-attendance-policy.ts';
import {PGlite} from '@electric-sql/pglite';
import {slackAttendanceSchema} from '../db/slack-attendance-schema.mjs';

test('attendance accepts other members, but rejects other workspaces/channels and uninvited private attendees',()=>{
 const row={team_id:'T',channel_id:'C',organizer_id:'owner',draft:{openJoin:true}};
 assert.equal(canAttendSlackMeeting(row,'T','C','member'),true);
 assert.equal(canAttendSlackMeeting(row,'other','C','member'),false);
 assert.equal(canAttendSlackMeeting(row,'T','other','member'),false);
 assert.equal(canAttendSlackMeeting(row,'T','C',''),false);
 const closed={...row,draft:{openJoin:false,participants:[{id:'invited'}]}};
 assert.equal(canAttendSlackMeeting(closed,'T','C','member'),false);
 assert.equal(canAttendSlackMeeting(closed,'T','C','invited'),true);
});

test('Slack account links are workspace-scoped and reference an actual session',async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE TABLE sessions(id text PRIMARY KEY); CREATE TABLE slack_meetings(id text PRIMARY KEY); CREATE TABLE oauth_states(id text PRIMARY KEY);');
  for(const statement of slackAttendanceSchema)await db.exec(statement);
  for(const statement of slackAttendanceSchema)await db.exec(statement);
  await db.exec("INSERT INTO sessions VALUES('s1'),('s2');INSERT INTO slack_google_accounts VALUES('T1','U','s1','google1'),('T2','U','s2','google2')");
  assert.equal((await db.query('SELECT * FROM slack_google_accounts')).rows.length,2);
  await assert.rejects(db.exec("INSERT INTO slack_google_accounts VALUES('T3','U','missing','google1')"));
 }finally{await db.close()}
});

import {claimAttendanceLink,completeAttendanceLink,type AttendanceDatabase} from '../lib/slack-attendance-store.ts';
test('private attendance tokens bind to one session, expire, and cannot be replayed or relinked',async()=>{
 const database=new PGlite();
 const db=(async(strings:TemplateStringsArray,...values:any[])=>
  (await database.query(strings.reduce((out,part,i)=>out+(i?'$'+i:'')+part,''),values)).rows) as AttendanceDatabase;
 try{
  await database.exec('CREATE TABLE sessions(id text PRIMARY KEY);CREATE TABLE slack_meetings(id text PRIMARY KEY);CREATE TABLE oauth_states(id text PRIMARY KEY);');
  for(const statement of slackAttendanceSchema)await database.exec(statement);
  await database.exec("INSERT INTO sessions VALUES('s1'),('s2');INSERT INTO slack_meetings VALUES('m');INSERT INTO slack_attendance_links(id,team_id,user_id,slack_meeting_id) VALUES('token','T','U','m'),('expired','T','V','m');UPDATE slack_attendance_links SET expires_at=now()-interval '1 second' WHERE id='expired'");
  assert.equal(await claimAttendanceLink(db,'unknown','s1'),null);
  assert.equal(await claimAttendanceLink(db,'expired','s1'),null);
  assert.equal((await claimAttendanceLink(db,'token','s1')).session_id,'s1');
  assert.equal(await claimAttendanceLink(db,'token','s2'),null);
  await assert.rejects(completeAttendanceLink(db,'token','s2','attacker'));
  await completeAttendanceLink(db,'token','s1','google1');
  assert.equal(await claimAttendanceLink(db,'token','s1'),null);
  await assert.rejects(completeAttendanceLink(db,'token','s1','google2'));
  assert.deepEqual((await database.query('SELECT * FROM slack_google_accounts')).rows,[{team_id:'T',user_id:'U',session_id:'s1',google_sub:'google1'}]);
  await database.exec("DELETE FROM sessions WHERE id='s1';DELETE FROM slack_meetings WHERE id='m'");
  assert.equal((await database.query('SELECT * FROM slack_google_accounts')).rows.length,0);
  assert.equal((await database.query('SELECT * FROM slack_attendance_links')).rows.length,0);
 }finally{await database.close()}
});
