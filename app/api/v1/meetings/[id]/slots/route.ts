import {agentResponse,agentKey,getAgentSlots} from '@/lib/agent-api';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){return agentResponse(async()=>getAgentSlots((await params).id,agentKey(req),Object.fromEntries(new URL(req.url).searchParams)))}
