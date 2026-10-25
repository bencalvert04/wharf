import {agentGuide} from '@/lib/agent-discovery';
import {appUrl} from '@/lib/auth';
export function GET(){return new Response(agentGuide(appUrl()),{headers:{'Content-Type':'text/plain; charset=utf-8'}})}
