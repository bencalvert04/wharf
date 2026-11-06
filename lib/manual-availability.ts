import {shared, type Attendee, type Constraints, type Interval} from './availability.ts';

export const manualStep = 15 * 60_000;

export function manualWindows(c: Constraints, attendees: Attendee[], now = Date.now()) {
  return shared(c, attendees).flatMap(window => {
    const skipped = Math.max(0, Math.floor((now - window.start) / manualStep) + 1);
    const start = window.start + skipped * manualStep;
    const end = start + Math.floor((window.end - start) / manualStep) * manualStep;
    return end - start >= c.duration * 60_000 ? [{start, end, date: window.date}] : [];
  });
}

export function manualBusy(
  selection: unknown, windows: Interval[], duration: number,
): Interval[] | null {
  const limit = windows.reduce((total, {start, end}) => total + (end - start) / manualStep, 0);
  if (!Array.isArray(selection) || !selection.length || selection.length > limit ||
    !selection.every(value => Number.isSafeInteger(value))) return null;
  const free: Interval[] = [];
  for (const start of [...new Set(selection)].sort((a, b) => a - b)) {
    if (!windows.some(window =>
      start >= window.start && start + manualStep <= window.end &&
      (start - window.start) % manualStep === 0)) return null;
    const previous = free.at(-1);
    if (previous && previous.end === start) previous.end += manualStep;
    else free.push({start, end: start + manualStep});
  }
  if (!free.some(({start, end}) => end - start >= duration * 60_000)) return null;
  // Everything the attendee did not mark is unavailable for this meeting.
  const busy: Interval[] = [];
  let start = 0;
  for (const block of free) {
    if (block.start > start) busy.push({start, end: block.start});
    start = block.end;
  }
  busy.push({start, end: 8_640_000_000_000_000});
  return busy;
}
