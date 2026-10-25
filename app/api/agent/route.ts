import {discovery} from '@/lib/agent-discovery';
import {appUrl} from '@/lib/auth';
export function GET(){return Response.json(discovery(appUrl()))}
