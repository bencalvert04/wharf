import {AsyncLocalStorage} from 'node:async_hooks';
export type DiscordInteraction={id:string;application_id:string;token:string;guild_id:string;channel_id:string;userId:string;participants:string[];timezone:string;responded?:boolean};
const context=new AsyncLocalStorage<DiscordInteraction>();
export const currentDiscordInteraction=()=>context.getStore();
export const withDiscordInteraction=<T>(value:DiscordInteraction,work:()=>T)=>context.run(value,work);
