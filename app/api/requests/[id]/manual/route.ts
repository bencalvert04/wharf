import {scheduleMeetingRefresh} from '@/lib/schedule-meeting-refresh';
import {json, meeting, sameOrigin, session, sql} from '@/lib/auth';
import {validEmail} from '@/lib/calendar-invitation';
import {manualAttendeeId} from '@/lib/manual-attendee';
import {manualBusy, manualWindows} from '@/lib/manual-availability';
import {plannerAccess} from '@/lib/planner-access';

export const maxDuration=60;

type Context = {params: Promise<{id: string}>};

async function load({params}: Context) {
  const {id} = await params;
  const row = await meeting(id);
  if (!row) return {error: json({error: 'Meeting not found or expired.'}, 404)};
  const constraints = JSON.parse(row.constraints);
  const visitor = await session();
  const access = await plannerAccess(row, visitor);
  if (row.final_time || row.agent_request_id || constraints.demo || access.slack || access.allowed) {
    return {error: json({error: 'Manual availability is unavailable for this meeting or role.'}, 409)};
  }
  const people = await sql()`SELECT google_sub, email, busy FROM attendees WHERE meeting_id=${id}`;
  const guest = visitor ? manualAttendeeId(id, visitor.id) : null;
  if (people.some(person => person.google_sub === guest || person.google_sub === visitor?.google_sub)) {
    return {error: json({error: 'You already shared availability for this meeting.'}, 409)};
  }
  const windows = manualWindows(constraints, people.map(person => ({name: '', busy: person.busy})));
  return {id, row, constraints, people, windows};
}

export async function GET(_req: Request, context: Context) {
  try {
    const result = await load(context);
    if (result.error) return result.error;
    const {constraints, windows, row} = result;
    return json({constraints, windows, revision: Number(row.revision)});
  } catch {
    return json({error: 'Could not load available times. Please try again.'}, 503);
  }
}

export async function POST(req: Request, context: Context) {
  if (!sameOrigin(req)) return json({error: 'Invalid origin.'}, 403);
  const input = await req.json().catch(() => null);
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!name || name.length > 100 || !validEmail(email)) {
    return json({error: 'Enter your name and a valid email for the invitation.'}, 400);
  }
  try {
    const result = await load(context);
    if (result.error) return result.error;
    const {id, row, constraints, people, windows} = result;
    const changed = 'Availability changed. Review the remaining times and try again.';
    if (Number(row.revision) !== input.revision) return json({error: changed, refresh: true}, 409);
    const busy = manualBusy(input.slots, windows, constraints.duration);
    if (!busy) return json({error: 'Mark remaining times that cover at least one full meeting.'}, 400);
    if (people.some(person => person.email?.toLowerCase() === email)) {
      return json({error: 'This email already has availability for this meeting.'}, 409);
    }
    const visitor = await session(true);
    const guest = manualAttendeeId(id, visitor!.id);
    const [saved] = await sql()`WITH changed AS (
      UPDATE requests SET revision=revision+1
      WHERE id=${id} AND revision=${row.revision} AND final_time IS NULL RETURNING id
    )
    INSERT INTO attendees(meeting_id,google_sub,name,email,busy)
    SELECT id,${guest},${name},${email},${JSON.stringify(busy)}::jsonb FROM changed
    RETURNING meeting_id`;
    if(saved)scheduleMeetingRefresh(id);
    return saved ? json({ok: true}) : json({error: changed, refresh: true}, 409);
  } catch {
    return json({error: 'Could not save your availability. Please try again.'}, 503);
  }
}
