import {cookies} from 'next/headers';
import {appleConfigured,exchangeAppleCode,appleDisplayName} from '@/lib/apple-signin';
import {bindCalendarAccount,runCalendarIntent} from '@/lib/calendar-intent';
import {sql,hash,appUrl} from '@/lib/auth';

export async function POST(req:Request){
 let meetingId='';
 const redirect=(status:string)=>new Response(null,{status:303,headers:{Location:appUrl()+'/?'+new URLSearchParams({...(meetingId?{meeting:meetingId}:{}),signin:status}),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 try{
  if(!appleConfigured())return redirect('unavailable');
  if(!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return redirect('failed');
  const raw=await req.text();if(raw.length>16000)return redirect('failed');
  const params=new URLSearchParams(raw),state=params.get('state'),jar=await cookies(),binding=jar.get('__Host-wharf_apple')?.value;
  if(!state||state.length>200||!binding)return redirect('expired');
  const [flow]=await sql()`DELETE FROM apple_signin_states WHERE id=${hash(state)} AND binding_hash=${hash(binding)} AND expires_at>now() RETURNING *`;
  if(!flow)return redirect('expired');
  jar.set('__Host-wharf_apple','',{httpOnly:true,secure:true,sameSite:'none',path:'/',maxAge:0});
  meetingId=flow.return_meeting_id||'';
  return await runCalendarIntent(flow.calendar_intent,async()=>{
   const [s]=await sql()`SELECT id FROM sessions WHERE id=${flow.session_id} AND google_sub IS NULL AND expires_at>now()`;
   if(!s)return redirect('expired');
   if(params.has('error'))return redirect('cancelled');
   const code=params.get('code');if(!code||code.length>4096)return redirect('failed');
   const identity=await exchangeAppleCode(code,flow.nonce);
   await bindCalendarAccount(sql(),identity.account);
   const db=sql();
   const [saved]=await db`SELECT name FROM apple_accounts WHERE account_id=${identity.account}`;
   const name=saved?.name||appleDisplayName(params.get('user'))||'Apple user';
   await db.transaction([
    db`INSERT INTO apple_accounts(account_id,name,email,authenticated_at) VALUES(${identity.account},${name},${identity.email},${flow.created_at}) ON CONFLICT(account_id) DO UPDATE SET email=EXCLUDED.email,authenticated_at=EXCLUDED.authenticated_at,updated_at=now()`,
    db`UPDATE sessions SET google_sub=${identity.account},name=${name},email=${identity.email},picture=NULL,apple_authenticated_at=${flow.created_at} WHERE id=${s.id} AND google_sub IS NULL AND expires_at>now()`,
   ]);
   // No attendee, snapshot, calendar credential, or invitation is created by login.
   return redirect('apple');
  });
 }catch{return redirect('failed');}
}
