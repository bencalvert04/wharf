import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {loadSlackProposal,insertSlackMeeting} from '../lib/slack-proposal.ts';
test('confirmation binds workspace, channel, requester, thread and current proposal; repeated clicks insert once',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE slack_context(team_id text,channel_id text,thread_ts text,user_id text,proposal jsonb,updated_at timestamptz DEFAULT now());
  CREATE TABLE slack_meetings(id text PRIMARY KEY,team_id text,channel_id text,thread_ts text,organizer_id text,draft jsonb,key_cipher text,UNIQUE(team_id,channel_id,thread_ts));`);
  const tag=async(strings:TemplateStringsArray,...values:any[])=>(await db.query(strings.reduce((q,s,i)=>q+(i?`$${i}`:'')+s,''),values)).rows;
  const scope={team:'T1',channel:'C1',thread:'1.0',user:'U1'},meeting={id:'proposal1',draft:{durationMinutes:15},cipher:'test'};
  await db.query(`INSERT INTO slack_context(team_id,channel_id,thread_ts,user_id,proposal) VALUES('T1','C1','1.0','U1',$1)`,[JSON.stringify({id:'proposal1',draft:meeting.draft})]);
  for(const key of ['team','channel','thread','user'] as const){
   const wrong={...scope,[key]:'wrong'};assert.equal(await loadSlackProposal(tag,wrong,'proposal1'),undefined);assert.equal(await insertSlackMeeting(tag,wrong,meeting,'proposal1'),undefined);
  }
  assert.equal(await loadSlackProposal(tag,scope,'stale'),undefined);
  assert.equal(await insertSlackMeeting(tag,scope,meeting,'stale'),undefined);
  assert.equal((await loadSlackProposal(tag,scope,'proposal1')).id,'proposal1');
  assert.equal((await insertSlackMeeting(tag,scope,meeting,'proposal1')).id,'proposal1');
  assert.equal(await insertSlackMeeting(tag,scope,meeting,'proposal1'),undefined);
  assert.equal((await db.query('SELECT * FROM slack_meetings')).rows.length,1);
  await db.exec('DELETE FROM slack_meetings; UPDATE slack_context SET proposal=NULL');
  assert.equal(await insertSlackMeeting(tag,scope,meeting,'proposal1'),undefined);
  await db.query(`UPDATE slack_context SET proposal=$1,updated_at=now()-interval '2 days'`,[JSON.stringify({id:'proposal1',draft:meeting.draft})]);
  assert.equal(await loadSlackProposal(tag,scope,'proposal1'),undefined);assert.equal(await insertSlackMeeting(tag,scope,meeting,'proposal1'),undefined);
 }finally{await db.close()}
});
