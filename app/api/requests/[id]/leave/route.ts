import {withdrawSnapshot} from '@/lib/meeting-participation';
import {manualAttendeeId} from '@/lib/manual-attendee';
import {session, meeting, sql, sameOrigin, json} from '@/lib/auth';

export async function POST(req: Request, {params}: {params: Promise<{id: string}>}) {
  if (!sameOrigin(req)) return json({error: 'Invalid origin.'}, 403);
  try {
    const visitor = await session();
    if (!visitor) return json({error: 'Sign in first.'}, 401);
    const {id} = await params;
    const row = await meeting(id);
    if (row?.final_time && !row.agent_request_id) {
      return json({error: 'This meeting has already been finalized.'}, 409);
    }
    const guest = manualAttendeeId(id, visitor.id);
    const [manual] = await sql()`SELECT 1 FROM attendees WHERE meeting_id=${id} AND google_sub=${guest}`;
    const attendeeId = manual ? guest : visitor.google_sub;
    if (attendeeId) await withdrawSnapshot(id, attendeeId);
    return json({ok: true});
  } catch {
    return json({error: 'Could not remove your availability.'}, 503);
  }
}
