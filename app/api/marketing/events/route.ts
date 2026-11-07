import {neon} from '@neondatabase/serverless';
import {parseMarketingEvent} from '@/lib/marketing/events';
export async function POST(req:Request){
 if(process.env.MARKETING_ENABLED!=='true'||!process.env.DATABASE_URL)return new Response(null,{status:204});
 // Browser-only collection. No cross-site requests or arbitrary server origins.
 if(req.headers.get('origin')!==new URL(req.url).origin)return new Response(null,{status:403});
 if(req.headers.get('dnt')==='1'||req.headers.get('sec-gpc')==='1')return new Response(null,{status:204});
 if(Number(req.headers.get('content-length'))>2048)return new Response(null,{status:413});
 const reader=req.body?.getReader();if(!reader)return new Response(null,{status:400});
 let bytes=0,text='';const decoder=new TextDecoder();
 while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>2048){await reader.cancel();return new Response(null,{status:413})}text+=decoder.decode(part.value,{stream:true})}
 let event;try{event=parseMarketingEvent(JSON.parse(text))}catch{return new Response(null,{status:400})}
 if(!event)return new Response(null,{status:400});
 try{const db=neon(process.env.DATABASE_URL);
 await db`INSERT INTO marketing_events(id,visit,event,view,source,medium,campaign,content,device)
 SELECT ${event.id},${event.visit},${event.event},${event.view},${event.source},${event.medium},${event.campaign},${event.content},${event.device}
 WHERE (SELECT count(*) FROM marketing_events WHERE visit=${event.visit})<100 ON CONFLICT(id) DO NOTHING`;
 }catch{/* Missing migration or analytics outage must not break the product. */}
 return new Response(null,{status:204});
}
