import {agentBody,agentResponse} from '@/lib/agent-api';
import {createAgentMeetingLink} from '@/lib/agent-meeting-link';
import {meetingLinkQuickstart} from '@/lib/agent-discovery';
import {appUrl} from '@/lib/auth';

export function GET(){return Response.json(meetingLinkQuickstart(appUrl()))}
export async function POST(req:Request){return agentResponse(async()=>createAgentMeetingLink(req,await agentBody(req)),201)}
