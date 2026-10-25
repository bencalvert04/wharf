import {agentOpenApi} from '@/lib/agent-openapi';
import {appUrl} from '@/lib/auth';
export function GET(){return Response.json(agentOpenApi(appUrl()))}
