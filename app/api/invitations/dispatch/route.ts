import {deliverInvitations} from '@/lib/invitations';
import {json,keyMatches} from '@/lib/auth';
export const maxDuration=60;
/** Invoke from a server-side scheduler even when every browser is closed. */
export async function GET(req:Request){
 if(!process.env.CRON_SECRET||!keyMatches(req.headers.get('authorization')||'','Bearer '+process.env.CRON_SECRET))return json({error:'Unauthorized'},401);
 try{return json(await deliverInvitations())}catch{return json({error:'Invitation worker unavailable.'},503)}
}
