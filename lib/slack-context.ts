import {AsyncLocalStorage} from 'node:async_hooks';
export type SlackWorkspace={teamId:string;botToken:string;botUserId:string;legacy?:boolean;platform?:'discord'};
const workspace=new AsyncLocalStorage<SlackWorkspace>();
export function withSlackWorkspace<T>(installation:SlackWorkspace,work:()=>T):T{return workspace.run(installation,work)}
export function currentSlackWorkspace(){return workspace.getStore()}
export function slackBotToken(){
 const current=workspace.getStore();
 if(!current?.botToken)throw Error('Slack workspace context is required');
 return current.botToken;
}
export function slackBotUserId(){return workspace.getStore()?.botUserId||''}
