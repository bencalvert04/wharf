import {cookies} from 'next/headers';
import {appUrl,sql,token} from '@/lib/auth';
import {slackScopes,slackStateHash} from '@/lib/slack-oauth';
export const runtime='nodejs';
export async function GET(){
 if(process.env.SLACK_PUBLIC_INSTALL_ENABLED!=='true'||!process.env.SLACK_CLIENT_ID||!process.env.SLACK_CLIENT_SECRET||!process.env.SLACK_APP_ID)return Response.redirect(new URL('/slack?install=unavailable',appUrl()));
 const state=token();
 await sql()`INSERT INTO slack_install_states(id,browser_hash) VALUES(${slackStateHash(state)},${slackStateHash(state)})`;
 (await cookies()).set('wharf_slack_install',state,{httpOnly:true,secure:true,sameSite:'lax',path:'/api/slack',maxAge:600});
 const url=new URL('https://slack.com/oauth/v2/authorize');
 url.searchParams.set('client_id',process.env.SLACK_CLIENT_ID);url.searchParams.set('scope',slackScopes.join(','));
 url.searchParams.set('redirect_uri',new URL('/api/slack/oauth/callback',appUrl()).href);url.searchParams.set('state',state);
 return new Response(null,{status:302,headers:{Location:url.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
