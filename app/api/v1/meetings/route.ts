import {agentResponse,agentBody,createAgentMeeting} from '@/lib/agent-api';
export async function POST(req:Request){return agentResponse(async()=>createAgentMeeting(req,await agentBody(req)),201)}
