import {agentResponse,agentKey,agentBody} from '@/lib/agent-api';
import {prepareAgentCalendar} from '@/lib/agent-booking';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){return agentResponse(async()=>prepareAgentCalendar((await params).id,agentKey(req),await agentBody(req)))}
