import {test} from 'node:test';
import assert from 'node:assert/strict';
import {manualBusy, manualStep, manualWindows} from '../lib/manual-availability.ts';
import {shared} from '../lib/availability.ts';

const c = {
  title: 'Planning', start: '2026-11-02', end: '2026-11-02', duration: 30,
  zone: 'UTC', from: '09:00', to: '12:00', days: [1],
};
const start = Date.parse('2026-11-02T09:00Z');
const at = (offset: number) => start + offset * manualStep;

test('manual windows exclude past times and conflicts with earlier attendees', () => {
  const windows = manualWindows(c, [{name: 'Attendee', busy: [{start: at(3), end: at(7)}]}], at(1));
  assert.deepEqual(windows, [{start: at(7), end: at(12), date: c.start}]);
  assert.equal(manualBusy([at(6), at(7), at(8)], windows, c.duration), null);
  assert.equal(manualBusy([at(7), at(9)], windows, c.duration), null);
  assert.equal(manualBusy([at(7), String(at(8))], windows, c.duration), null);
});

test('manual selection feeds existing scheduling with only the marked blocks free', () => {
  const windows = manualWindows(c, [], at(-1));
  const busy = manualBusy([at(3), at(1), at(2), at(2), at(8)], windows, c.duration);
  assert.ok(busy);
  assert.deepEqual(shared(c, [{name: 'Manual guest', busy}]).map(({start, end}) => ({start, end})), [
    {start: at(1), end: at(4)}, {start: at(8), end: at(9)},
  ]);
});
