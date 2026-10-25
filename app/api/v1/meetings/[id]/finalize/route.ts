import {agentResponse,agentBody,agentKey,finalizeAgentMeeting} from '@/lib/agent-api';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){return agentResponse(async()=>finalizeAgentMeeting((await params).id,agentKey(req),await agentBody(req)))}
