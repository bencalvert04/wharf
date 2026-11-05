import {verifyAppleNotification,applyAppleNotification} from '@/lib/apple-notifications';
import {sql,json} from '@/lib/auth';
export async function POST(req:Request){
 // Notifications may target a primary App ID rather than the web Services ID.
 // Require an explicit audience from Apple's registration, never trust the JWT's.
 const audience=process.env.APPLE_NOTIFICATION_AUDIENCE;
 if(!audience)return json({error:'Apple notifications are not configured.'},503);
 if(req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return json({error:'Expected JSON.'},415);
 let event;
 try{
  const reader=req.body?.getReader();if(!reader)return json({error:'Invalid notification.'},400);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>20000){await reader.cancel();return json({error:'Notification too large.'},413)}chunks.push(value)}
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(typeof body.payload!=='string')return json({error:'Invalid notification.'},400);
  event=await verifyAppleNotification(body.payload,audience);
 }catch{return json({error:'Invalid or unsupported Apple notification.'},400)}
 try{await applyAppleNotification(sql(),event);return json({ok:true})}
 catch{return json({error:'Could not process Apple notification. Retry delivery.'},503)}
}
