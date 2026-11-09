import {createHmac} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {gmailConfigured,gmailTransport} from '@/lib/gmail-delivery';
import {feedbackMessage,feedbackRecipients,parseFeedback} from '@/lib/feedback';
import {json} from '@/lib/auth';
export const maxDuration=30;
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Please send feedback from Wharf.'},403);
 if(process.env.NODE_ENV==='development')return json({error:'This is a local preview. No email was sent.'},503);
 if(!gmailConfigured()||!process.env.DATABASE_URL||!process.env.CRON_SECRET)return json({error:'The feedback form is temporarily unavailable. Please use the email link below.'},503);
 const reader=req.body?.getReader();if(!reader)return json({error:'Please enter your feedback.'},400);
 let size=0,body='';const decoder=new TextDecoder();
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>14000){await reader.cancel();return json({error:'Please keep your message under 3,000 characters.'},413)}body+=decoder.decode(part.value,{stream:true})}
 let data;try{data=parseFeedback(JSON.parse(body))}catch{}
 if(!data)return json({error:'Enter at least 10 characters and a valid reply email, or leave email blank.'},400);
 const db=neon(process.env.DATABASE_URL);
 try{
 const [prior]=await db`SELECT status FROM feedback_attempts WHERE id=${data.id}`;
 if(prior)return prior.status==='sent'?json({ok:true}):json({error:'This report may already have been submitted. Please use the email link if you need to follow up.'},409);
 // Vercel supplies this header; outside Vercel use one shared conservative bucket.
 const ip=process.env.VERCEL?req.headers.get('x-vercel-forwarded-for')||'unknown':'shared';
 const hour=Math.floor(Date.now()/3600000);
 const key=createHmac('sha256',process.env.CRON_SECRET).update(`${hour}:${ip}`).digest('hex');
 const [limit]=await db`INSERT INTO feedback_limits(key,attempts,expires_at) VALUES(${key},1,now()+interval '2 hours') ON CONFLICT(key) DO UPDATE SET attempts=feedback_limits.attempts+1 WHERE feedback_limits.attempts<5 RETURNING key`;
 if(!limit)return json({error:'Too many reports in a short time. Please try again later or email us directly.'},429);
 const [claim]=await db`INSERT INTO feedback_attempts(id) VALUES(${data.id}) ON CONFLICT DO NOTHING RETURNING id`;
 if(!claim)return json({error:'This report is already being processed.'},409);
 try{
 const result=await gmailTransport().sendMail(feedbackMessage(data,process.env.INVITATION_FROM!));
 if(result.rejected.length||!feedbackRecipients.every(address=>result.accepted.some(value=>String(value).toLowerCase()===address)))throw Error('Incomplete delivery');
 await db`UPDATE feedback_attempts SET status='sent' WHERE id=${data.id}`;
 return json({ok:true});
 }catch{await db`UPDATE feedback_attempts SET status='uncertain' WHERE id=${data.id}`;return json({error:'We could not confirm delivery to both founders. Please use the email link below to follow up.'},502)}
 }catch{return json({error:'We could not send your feedback. Please use the email link below.'},503)}
}
