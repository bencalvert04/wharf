import {session,sql,hash,sameOrigin} from '@/lib/auth';
import { getDb } from '@/db';
import { requests } from '@/db/schema';
import { validate, type Constraints } from '@/lib/availability';
export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:'Invalid origin.'},{status:403});
 let c:Constraints;
 try{const raw=await req.text();if(raw.length>5000)return Response.json({error:'Request too large.'},{status:413});c=JSON.parse(raw);validate(c)}catch(e){return Response.json({error:e instanceof SyntaxError?'Invalid JSON.':e instanceof Error?e.message:'Invalid request.'},{status:400})}
 if(!process.env.DATABASE_URL)return Response.json({error:'Meeting storage is not connected yet. Please try the sample calendars.'},{status:503});
 try{
 const clean:Constraints={...(c.demo===true?{demo:true,sampleCount:Number.isInteger(c.sampleCount)?Math.max(1,Math.min(4,c.sampleCount!)):4}:{}),title:c.demo===true?'lucid demo':c.title.trim()||'Untitled meeting',start:c.start,end:c.end,duration:c.duration,zone:c.zone,from:c.from,to:c.to,days:[...new Set(c.days)]};
 const id=crypto.randomUUID(), key=crypto.randomUUID();
 const owner=await session(true);
 await sql()`INSERT INTO requests(id,constraints,created_at,planner_key,owner_session) VALUES(${id},${JSON.stringify(clean)},${new Date().toISOString()},${'sha256:'+hash(key)},${owner!.id})`;
 return Response.json({id,plannerKey:key,invitationUrl:`${new URL(req.url).origin}/?meeting=${id}`},{status:201,headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Unable to save this meeting. Please try again.'},{status:503})}
}
