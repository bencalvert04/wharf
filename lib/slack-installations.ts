import {sql} from './auth';
import {openToken,sealToken} from './token-vault';
import {withSlackWorkspace,type SlackWorkspace} from './slack-context';
export async function slackInstallation(teamId:string):Promise<SlackWorkspace|null>{
 if(!/^T[A-Z0-9]+$/.test(teamId))return null;
 const [row]=await sql()`SELECT * FROM slack_installations WHERE team_id=${teamId}`;
 // A revoked installation is a tombstone: never fall back to the legacy token.
 if(row){if(row.revoked_at||!row.bot_token_cipher)return null;return {teamId,botToken:openToken(row.bot_token_cipher,`slack-installation:${teamId}`),botUserId:row.bot_user_id}}
 if(teamId===process.env.SLACK_TEAM_ID&&process.env.SLACK_BOT_TOKEN)return {teamId,botToken:process.env.SLACK_BOT_TOKEN,botUserId:process.env.SLACK_BOT_USER_ID||'',legacy:true};
 return null;
}
export async function inSlackWorkspace<T>(teamId:string,work:()=>Promise<T>):Promise<T>{
 const installation=await slackInstallation(teamId);
 if(!installation)throw Error('Slack workspace is not installed');
 return withSlackWorkspace(installation,work);
}
export async function saveSlackInstallation(data:{teamId:string;teamName:string;botUserId:string;botToken:string;scopes:string;installedBy:string}){
 const cipher=sealToken(data.botToken,`slack-installation:${data.teamId}`);
 await sql()`INSERT INTO slack_installations(team_id,team_name,bot_user_id,bot_token_cipher,scopes,installed_by)
 VALUES(${data.teamId},${data.teamName},${data.botUserId},${cipher},${data.scopes},${data.installedBy})
 ON CONFLICT(team_id) DO UPDATE SET team_name=EXCLUDED.team_name,bot_user_id=EXCLUDED.bot_user_id,bot_token_cipher=EXCLUDED.bot_token_cipher,scopes=EXCLUDED.scopes,installed_by=EXCLUDED.installed_by,installed_at=now(),updated_at=now(),revoked_at=NULL`;
}
export async function revokeSlackInstallation(teamId:string,eventTime:number){
 // Slack can retry an old uninstall after a reinstall. Do not revoke the new grant.
 const installation=await slackInstallation(teamId);
 if(!installation)return;
 await sql()`INSERT INTO slack_installations(team_id,team_name,bot_user_id,scopes,installed_by,revoked_at)
 VALUES(${teamId},'',${installation.botUserId},'','',now())
 ON CONFLICT(team_id) DO UPDATE SET bot_token_cipher=NULL,revoked_at=now(),updated_at=now()
 WHERE slack_installations.installed_at<=to_timestamp(${eventTime})`;
}
