import {sealToken,openToken} from './token-vault.ts';
export type EmbedIdentity={meeting:string;team:string;user:string;expires:number};
export function embedToken(identity:Omit<EmbedIdentity,'expires'>,now=Date.now()){
 return sealToken(JSON.stringify({...identity,expires:now+10*60*1000}),'slack-calendar-embed');
}
export function readEmbedToken(token:string,now=Date.now()):EmbedIdentity{
 const value=JSON.parse(openToken(token,'slack-calendar-embed'));
 if(!value.meeting||!value.team||!value.user||!Number.isFinite(value.expires)||value.expires<=now||value.expires>now+10*60*1000)throw Error('Reopen the calendar from Slack to continue.');
 return value;
}
