import {withdrawSnapshot} from '@/lib/meeting-participation';
import {session,sameOrigin,json} from '@/lib/auth';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){if(!sameOrigin(req))return json({error:'Invalid origin.'},403);try{const s=await session();if(!s?.google_sub)return json({error:'Sign in first.'},401);const {id}=await params;await withdrawSnapshot(id,s.google_sub);return json({ok:true})}catch{return json({error:'Could not remove your availability.'},503)}}
