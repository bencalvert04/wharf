import {cookies} from 'next/headers';
import {appUrl,sql} from '@/lib/auth';
import {validSlackState,slackStateHash,parseSlackInstallation} from '@/lib/slack-oauth';
import {saveSlackInstallation} from '@/lib/slack-installations';
export const runtime='nodejs';
export async function GET(req:Request){
 const url=new URL(req.url),jar=await cookies(),state=url.searchParams.get('state');
 const finish=(status:string)=>new Response(null,{status:303,headers:{Location:new URL(`/slack?install=${status}`,appUrl()).href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 if(!validSlackState(state,jar.get('wharf_slack_install')?.value))return finish('invalid');
 jar.set('wharf_slack_install','',{httpOnly:true,secure:true,sameSite:'lax',path:'/api/slack',maxAge:0});
 try{
  const [claimed]=await sql()`DELETE FROM slack_install_states WHERE id=${slackStateHash(state!)} AND browser_hash=${slackStateHash(state!)} AND expires_at>now() RETURNING id`;
  if(!claimed)return finish('invalid');
  if(url.searchParams.has('error'))return finish('cancelled');
  const code=url.searchParams.get('code');
  if(!code||!process.env.SLACK_CLIENT_ID||!process.env.SLACK_CLIENT_SECRET||!process.env.SLACK_APP_ID)return finish('unavailable');
  const response=await fetch('https://slack.com/api/oauth.v2.access',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.SLACK_CLIENT_ID,client_secret:process.env.SLACK_CLIENT_SECRET,code,redirect_uri:new URL('/api/slack/oauth/callback',appUrl()).href}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)return finish('failed');
  await saveSlackInstallation(parseSlackInstallation(await response.json(),process.env.SLACK_APP_ID));
  return finish('success');
 }catch{console.error('Slack installation failed');return finish('failed')}
}
