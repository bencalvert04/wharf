import {agentResponse,agentKey,agentBody} from '@/lib/agent-api';
import {bookAgentMeeting} from '@/lib/agent-booking';
export const maxDuration=60;
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){return agentResponse(async()=>bookAgentMeeting((await params).id,agentKey(req),await agentBody(req)))}
