import {agentResponse,agentKey,getAgentMeeting} from '@/lib/agent-api';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){return agentResponse(async()=>getAgentMeeting((await params).id,agentKey(req)))}
