// Keep proposal authorization and insertion in SQL so stale or cross-user buttons cannot create meetings.
type SQL=(strings:TemplateStringsArray,...values:any[])=>Promise<any[]>;
export type ProposalScope={team:string;channel:string;thread:string;user:string};
export async function loadSlackProposal(db:SQL,s:ProposalScope,id:string){
 const [context]=await db`SELECT proposal FROM slack_context WHERE team_id=${s.team} AND channel_id=${s.channel} AND thread_ts=${s.thread} AND user_id=${s.user} AND proposal->>'id'=${id} AND updated_at>now()-interval '1 day'`;
 return context?.proposal;
}
export async function insertSlackMeeting(db:SQL,s:ProposalScope,meeting:{id:string;draft:unknown;cipher:string},proposalId?:string){
 const [row]=await db`WITH valid_context AS (
 SELECT 1 FROM slack_context WHERE team_id=${s.team} AND channel_id=${s.channel} AND thread_ts=${s.thread} AND user_id=${s.user} AND proposal->>'id'=${proposalId||''} AND updated_at>now()-interval '1 day' FOR UPDATE
 ) INSERT INTO slack_meetings(id,team_id,channel_id,thread_ts,organizer_id,draft,key_cipher)
 SELECT ${meeting.id},${s.team},${s.channel},${s.thread},${s.user},${JSON.stringify(meeting.draft)}::jsonb,${meeting.cipher}
 WHERE ${!proposalId} OR EXISTS(SELECT 1 FROM valid_context)
 ON CONFLICT DO NOTHING RETURNING *`;
 return row;
}
