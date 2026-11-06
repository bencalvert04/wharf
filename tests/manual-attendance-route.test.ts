import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {loadWithMocks} from './module-fixture.ts';
import {manualBusy, manualWindows} from '../lib/manual-availability.ts';
import {validEmail} from '../lib/calendar-invitation.ts';
import {validFinalSlot} from '../lib/finalization.ts';
import {googleEventPayload} from '../lib/google-event-payload.ts';

const constraints = {
  title: 'Planning', start: '2035-01-02', end: '2035-01-02', duration: 30,
  zone: 'UTC', from: '09:00', to: '12:00', days: [0, 1, 2, 3, 4, 5, 6],
};
const start = Date.parse('2035-01-02T09:00Z');
type Handler = (req: Request, context: {params: Promise<{id: string}>}) => Promise<Response>;

async function fixture() {
  const database = new PGlite();
  await database.exec(`
    CREATE TABLE requests(id text PRIMARY KEY, constraints text, revision integer DEFAULT 0, final_time jsonb, agent_request_id text);
    CREATE TABLE attendees(meeting_id text, google_sub text, name text, email text, busy jsonb, PRIMARY KEY(meeting_id,google_sub));
    CREATE TABLE google_meeting_events(meeting_id text PRIMARY KEY, organizer_sub text, event_id text, payload jsonb);
    CREATE TABLE invitation_outbox(meeting_id text);
    CREATE TABLE request_invitees(id text, meeting_id text, google_sub text);
  `);
  await database.query('INSERT INTO requests(id,constraints) VALUES($1,$2)', ['meeting', JSON.stringify(constraints)]);
  await database.query('INSERT INTO attendees VALUES($1,$2,$3,$4,$5)', [
    'meeting', 'organizer', 'Organizer', 'organizer@example.test',
    JSON.stringify([{start, end: start + 3_600_000}]),
  ]);
  let visitor = {id: 'guest-session', google_sub: null as string | null};
  let sameOrigin = true;
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.reduce((out, part, index) => out + (index ? '$' + index : '') + part, '');
    return {query, values, then: (resolve: any, reject: any) => database.query(query, values).then(result => result.rows).then(resolve, reject)};
  };
  const db = Object.assign(tag, {transaction: (queries: {query: string; values: unknown[]}[]) =>
    database.transaction(async tx => {
      const results = [];
      for (const query of queries) results.push((await tx.query(query.query, query.values)).rows);
      return results;
    }),
  });
  const auth = {
    json: (body: unknown, status = 200) => Response.json(body, {status}),
    sameOrigin: () => sameOrigin, session: async () => visitor, sql: () => db,
    appUrl: () => 'https://wharf.example.test',
    meeting: async () => (await database.query('SELECT * FROM requests')).rows[0],
    hash: (value: string) => createHash('sha256').update(value).digest('hex'),
  };
  const {manualAttendeeId} = loadWithMocks<{manualAttendeeId: Function}>(
    new URL('../lib/manual-attendee.ts', import.meta.url), {'./auth': auth});
  const route = loadWithMocks<{GET: Handler; POST: Handler}>(
    new URL('../app/api/requests/[id]/manual/route.ts', import.meta.url), {
      '@/lib/auth': auth, '@/lib/calendar-invitation': {validEmail},
      '@/lib/manual-attendee': {manualAttendeeId},
      '@/lib/manual-availability': {manualBusy, manualWindows},
      '@/lib/planner-access': {plannerAccess: async () => ({allowed: false, slack: null})},
    });
  const google = loadWithMocks<{commitGoogleFinalization: Function}>(
    new URL('../lib/google-meeting-events.ts', import.meta.url), {
      './auth': auth, './slack-booking-notice': {}, './calendar-connection': {},
      './google': {}, './token-vault': {}, './calendar-access': {},
      './google-event-payload': {googleEventPayload},
    });
  const {withdrawSnapshot} = loadWithMocks<{withdrawSnapshot: Function}>(
    new URL('../lib/meeting-participation.ts', import.meta.url), {
      './auth': auth, './pending-meeting-store': {},
    });
  const context = {params: Promise.resolve({id: 'meeting'})};
  const get = () => route.GET(new Request('https://wharf.example.test/api/requests/meeting/manual'), context);
  const save = (overrides = {}) => route.POST(new Request('https://wharf.example.test/api/requests/meeting/manual', {
    method: 'POST', body: JSON.stringify({
      name: 'Guest', email: 'guest@outlook.com', revision: 0,
      slots: [start + 3_600_000, start + 4_500_000], ...overrides,
    }),
  }), context);
  return {
    database, get, save, google,
    leave: () => withdrawSnapshot('meeting', manualAttendeeId('meeting', visitor.id)),
    setVisitor: (id: string) => {visitor = {id, google_sub: null}},
    disallowOrigin: () => {sameOrigin = false},
  };
}

test('manual route saves a guest and Google finalization includes their non-Gmail invitation address', async () => {
  const f = await fixture();
  try {
    const response = await f.get();
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.windows[0].start, start + 3_600_000);
    assert.equal(JSON.stringify(data).includes('organizer@example.test'), false);
    assert.equal((await f.save()).status, 200);
    assert.equal((await f.save()).status, 409);
    const people = (await f.database.query<any>('SELECT google_sub,name,email,busy FROM attendees')).rows;
    const guest = people.find(person => person.name === 'Guest');
    assert.equal(guest.email, 'guest@outlook.com');
    assert.match(guest.google_sub, /^manual:/);
    const selected = start + 3_600_000, end = selected + 1_800_000;
    assert.equal(validFinalSlot(constraints, people, selected, end), true);
    assert.equal(validFinalSlot(constraints, people, selected + 1_800_000, end + 1_800_000), false);
    assert.equal(await f.google.commitGoogleFinalization('meeting', constraints, people, selected, end, 'organizer', 'organizer@example.test'), true);
    const job = (await f.database.query<any>('SELECT payload FROM google_meeting_events')).rows[0];
    assert.ok(job.payload.attendees.some((attendee: any) => attendee.email === 'guest@outlook.com'));
    f.setVisitor('late-guest');
    assert.equal((await f.save({revision: 2})).status, 409);
  } finally {await f.database.close()}
});

test('manual route rejects blocked cells, stale submissions and concurrent attendance changes', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.save({slots: [start, start + 900_000]})).status, 400);
    assert.equal((await f.save({revision: -1})).status, 409);
    const responses = await Promise.all([f.save(), f.save()]);
    assert.equal(responses.filter(response => response.status === 200).length, 1);
    assert.equal(responses.filter(response => response.status === 409).length, 1);
    assert.equal((await f.database.query('SELECT * FROM attendees')).rows.length, 2);
    f.setVisitor('another-guest');
    const stale = await f.save();
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).refresh, true);
    assert.equal((await f.save({revision: 1})).status, 409); // Duplicate invitation address.
    f.disallowOrigin();
    assert.equal((await f.save()).status, 403);
  } finally {await f.database.close()}
});

test('a manual guest can withdraw and rejoin using the same session', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.save()).status, 200);
    await f.leave();
    assert.equal((await f.database.query('SELECT * FROM attendees')).rows.length, 1);
    assert.equal((await f.save({revision: 2})).status, 200);
  } finally {await f.database.close()}
});
