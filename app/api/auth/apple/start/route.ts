import {cookies} from 'next/headers';
import {appleAuthorize,appleConfigured} from '@/lib/apple-signin';
import {beginCalendarIntent,runCalendarIntent} from '@/lib/calendar-intent';
import {session,sql,hash,token,sameOrigin,json} from '@/lib/auth';

export async function POST(req:Request){
 if(!sameOrigin(req))return json({error:'Invalid origin.'},403);
 if(!appleConfigured())return json({error:'Sign in with Apple is not available yet. The site owner needs to finish Apple registration.'},503);
 try{
  const raw=await req.text();if(raw.length>1000)return json({error:'Request too large.'},413);
  const input=JSON.parse(raw),returnId=input.returnMeetingId;
  if(returnId!=null&&(typeof returnId!=='string'||!/^[-a-zA-Z0-9]{1,100}$/.test(returnId)))return json({error:'Invalid return meeting.'},400);
  const s=(await session(true))!;
  if(s.google_sub)return json({error:'Sign out before signing in with a different account.'},409);
  const state=token(),nonce=token(),binding=token(),url=appleAuthorize(state,nonce);
  const intent=await beginCalendarIntent(sql(),s.id,null);
  await runCalendarIntent(intent,async()=>{
   const db=sql();
   await db.transaction([
    db`DELETE FROM apple_signin_states WHERE session_id=${s.id}`,
    db`INSERT INTO apple_signin_states(id,session_id,binding_hash,nonce,return_meeting_id,calendar_intent,expires_at) VALUES(${hash(state)},${s.id},${hash(binding)},${nonce},${returnId||null},${JSON.stringify(intent)}::jsonb,now()+interval '10 minutes')`,
   ]);
  });
  // Apple's cross-site form POST does not carry our normal SameSite=Lax session.
  // Bind that POST to this browser without relaxing the main session cookie.
  (await cookies()).set('__Host-wharf_apple',binding,{httpOnly:true,secure:true,sameSite:'none',path:'/',maxAge:600});
  return json({url});
 }catch{return json({error:'Could not start Sign in with Apple. Please try again.'},503);}
}
