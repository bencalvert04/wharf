import {createHash,timingSafeEqual} from 'node:crypto';
export const slackScopes=['app_mentions:read','chat:write','im:write','users:read','mpim:history','mpim:read','channels:read','channels:history'];
export const slackStateHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function validSlackState(state:string|null,cookie:string|undefined){
 return !!state&&!!cookie&&/^[A-Za-z0-9_-]{43}$/.test(state)&&/^[A-Za-z0-9_-]{43}$/.test(cookie)&&timingSafeEqual(Buffer.from(state),Buffer.from(cookie));
}
export function parseSlackInstallation(data:any,appId:string){
 if(!data.ok||data.app_id!==appId||data.is_enterprise_install||!/^T[A-Z0-9]+$/.test(data.team?.id||'')||!/^U[A-Z0-9]+$/.test(data.bot_user_id||'')||!data.access_token?.startsWith('xoxb-')||!data.authed_user?.id||data.token_type!=='bot'||data.refresh_token)throw Error('Unsupported Slack installation');
 const granted=new Set(String(data.scope||'').split(','));
 if(slackScopes.some(scope=>!granted.has(scope)))throw Error('Missing required Slack permissions');
 return {teamId:data.team.id,teamName:String(data.team.name||'Slack workspace'),botUserId:data.bot_user_id,botToken:data.access_token,scopes:String(data.scope),installedBy:String(data.authed_user.id)};
}
