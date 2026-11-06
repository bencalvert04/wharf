import {appUrl} from '@/lib/auth';
export function GET(){
 const id=process.env.DISCORD_APPLICATION_ID;
 if(!id||!process.env.DISCORD_PUBLIC_KEY||!process.env.DISCORD_BOT_TOKEN)return Response.redirect(new URL('/discord?install=unavailable',appUrl()),303);
 const url=new URL('https://discord.com/oauth2/authorize');
 url.search=new URLSearchParams({client_id:id,scope:'bot applications.commands',permissions:'3072',integration_type:'0'}).toString();
 return Response.redirect(url,303);
}
