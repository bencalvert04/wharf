'use client';

import {useEffect, useMemo, useRef, useState, type PointerEvent, type KeyboardEvent} from 'react';
import {ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, X} from 'lucide-react';
import {allowed, dates, localParts, type Constraints} from '@/lib/availability';
import {calendarTickLabel} from '@/lib/calendar-display';
import {manualBusy, manualStep} from '@/lib/manual-availability';

type ManualData = {
  constraints: Constraints;
  windows: {start: number; end: number; date: string}[];
  revision: number;
};
type Cell = {day: number; row: number; start: number; enabled: boolean};
type Stroke = {start: number; day: number; row: number; selecting: boolean; before: Set<number>; pointer: number};

export default function ManualAvailability({meetingId, preview, onClose, onSaved}: {
  meetingId: string;
  preview?: ManualData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const stroke = useRef<Stroke | null>(null);
  const [data, setData] = useState<ManualData | null>(preview || null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!preview);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [daysPerPage, setDaysPerPage] = useState(5);
  const [focused, setFocused] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 620px)');
    const resize = () => {setDaysPerPage(media.matches ? 3 : 5); setPage(0)};
    resize();
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    fetch('/api/requests/' + encodeURIComponent(meetingId) + '/manual', {signal: controller.signal})
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw Error(result.error || 'Could not load available times.');
        setData(result);
      })
      .catch(reason => {if (reason.name !== 'AbortError') setError(reason.message)})
      .finally(() => {if (!controller.signal.aborted) setLoading(false)});
    return () => controller.abort();
  }, [meetingId, preview]);

  const layout = useMemo(() => {
    if (!data) return {days: [] as string[], rows: [] as number[], cells: [] as Cell[]};
    const {constraints, windows} = data;
    const days = dates(constraints);
    const minute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    const first = Math.floor(minute(constraints.from) / 15) * 15;
    const rows = Array.from({length: Math.ceil((minute(constraints.to) - first) / 15)}, (_, i) => first + i * 15);
    const cells: Cell[] = [];
    for (const range of allowed(constraints)) {
      for (let start = range.start; start + manualStep <= range.end; start += 60_000) {
        const time = minute(localParts(start, constraints.zone).time);
        if (time % 15) continue;
        cells.push({
          day: days.indexOf(range.date), row: rows.indexOf(time), start,
          enabled: windows.some(window => start >= window.start && start + manualStep <= window.end),
        });
      }
    }
    return {days, rows, cells};
  }, [data]);
  const firstDay = page * daysPerPage;
  const shownDays = layout.days.slice(firstDay, firstDay + daysPerPage);
  const visibleCells = layout.cells.filter(cell => cell.day >= firstDay && cell.day < firstDay + daysPerPage);
  const enabledCells = visibleCells.filter(cell => cell.enabled);
  const tabStop = enabledCells.some(cell => cell.start === focused) ? focused : enabledCells[0]?.start;
  const hasMeeting = !!data && !!manualBusy([...selected], data.windows, data.constraints.duration);
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat('en-US', {
    timeZone: data?.constraints.zone, weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }), [data?.constraints.zone]);
  const formatTime = (start: number) => timeFormatter.format(start);
  const dateText = (day: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', {...options, timeZone: 'UTC'}).format(new Date(day + 'T12:00Z'));

  function paint(day: number, row: number) {
    const active = stroke.current;
    if (!active) return;
    const next = new Set(active.before);
    for (const cell of visibleCells) {
      if (day === active.day && row === active.row && cell.start !== active.start) continue;
      if (!cell.enabled || cell.day < Math.min(active.day, day) || cell.day > Math.max(active.day, day) ||
        cell.row < Math.min(active.row, row) || cell.row > Math.max(active.row, row)) continue;
      if (active.selecting) next.add(cell.start);
      else next.delete(cell.start);
    }
    setSelected(next);
  }
  function begin(event: PointerEvent<HTMLButtonElement>, cell: Cell) {
    if (saving || !cell.enabled || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus({preventScroll: true});
    setFocused(cell.start);
    setHovered(cell.start);
    stroke.current = {start: cell.start, day: cell.day, row: cell.row, selecting: !selected.has(cell.start), before: new Set(selected), pointer: event.pointerId};
    grid.current?.setPointerCapture(event.pointerId);
    paint(cell.day, cell.row);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!stroke.current || event.pointerId !== stroke.current.pointer) return;
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-manual-cell]');
    if (!element || !grid.current?.contains(element)) return;
    paint(Number(element.dataset.day), Number(element.dataset.row));
  }
  function finish() {stroke.current = null}
  function key(event: KeyboardEvent<HTMLButtonElement>, cell: Cell) {
    const directions: Record<string, [number, number]> = {ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0]};
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const candidates = enabledCells.filter(next => direction[0]
      ? next.row === cell.row && (next.day - cell.day) * direction[0] > 0
      : next.day === cell.day && (next.start - cell.start) * direction[1] > 0);
    candidates.sort((a, b) => Math.abs(a.day - cell.day) - Math.abs(b.day - cell.day) || Math.abs(a.start - cell.start) - Math.abs(b.start - cell.start));
    const next = candidates[0];
    if (!next) return;
    setFocused(next.start);
    grid.current?.querySelector<HTMLButtonElement>(`[data-start="${next.start}"]`)?.focus();
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !data || !hasMeeting) return;
    setSaving(true); setError('');
    try {
      if (preview) {onSaved(); return}
      const response = await fetch('/api/requests/' + encodeURIComponent(meetingId) + '/manual', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name, email, slots: [...selected], revision: data.revision}),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.refresh) {
          const refreshed = await fetch('/api/requests/' + encodeURIComponent(meetingId) + '/manual');
          const latest = await refreshed.json();
          if (refreshed.ok) {
            setData(latest);
            setSelected(previous => new Set([...previous].filter(start => latest.windows.some((window: {start: number; end: number}) => start >= window.start && start + manualStep <= window.end))));
          } else {setData(null); setSelected(new Set())}
        }
        throw Error(result.error || 'Could not save your availability.');
      }
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save your availability.');
    } finally {setSaving(false)}
  }

  return <dialog ref={dialog} className="modal manual-availability" aria-labelledby="manual-title" onCancel={event => {event.preventDefault(); if (!saving) onClose()}}>
    <button type="button" className="modal-close icon-button" aria-label="Close manual availability" disabled={saving} onClick={onClose}><X size={18}/></button>
    <div className="manual-heading">
      <span className="manual-eyebrow"><CalendarDays size={15}/> Your availability {preview && <span className="small-tag">Preview</span>}</span>
      <h2 id="manual-title">When are you free?</h2>
      <p>Drag over the times you can attend. Only times that still work for the group can be selected.</p>
    </div>
    {loading && <p className="manual-loading" role="status">Finding the remaining times…</p>}
    {data && <form onSubmit={save}>
      <div className="manual-toolbar">
        <span>{data.constraints.duration} min meeting <span className="manual-separator">·</span> {data.constraints.zone.replaceAll('_', ' ')}</span>
        <div className="week-nav">
          <button type="button" className="icon-button" aria-label="Previous dates" disabled={saving || page === 0} onClick={() => {finish(); setPage(page - 1)}}><ChevronLeft size={17}/></button>
          <span>{shownDays.length ? dateText(shownDays[0], {month: 'short', day: 'numeric'}) : ''}</span>
          <button type="button" className="icon-button" aria-label="Next dates" disabled={saving || firstDay + daysPerPage >= layout.days.length} onClick={() => {finish(); setPage(page + 1)}}><ChevronRight size={17}/></button>
        </div>
      </div>
      {data.windows.length ? <>
        <div className="manual-grid-scroll">
          <div ref={grid} className="manual-grid" style={{gridTemplateColumns: `64px repeat(${shownDays.length}, minmax(70px, 1fr))`}} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => {if (stroke.current) setSelected(stroke.current.before); finish()}} onLostPointerCapture={finish}>
            <div className="manual-grid-corner"/>
            {shownDays.map(day => <div className="manual-day" key={day}><span>{dateText(day, {weekday: 'short'})}</span><strong>{dateText(day, {day: 'numeric'})}</strong></div>)}
            {layout.rows.map((minute, row) => <div className="manual-grid-row" key={minute}>
              <span className="manual-time">{minute % 60 === 0 || row === 0 ? calendarTickLabel(minute) : ''}</span>
              {shownDays.map((day, dayIndex) => {
                const cells = visibleCells.filter(cell => cell.day === firstDay + dayIndex && cell.row === row);
                return <div className="manual-cell-wrap" data-manual-cell="true" data-day={firstDay + dayIndex} data-row={row} data-hour={minute % 60 === 0 || undefined} key={day}>
                  {cells.length ? cells.map(cell => <button
                    type="button" key={cell.start} data-manual-cell="true" data-day={cell.day} data-row={cell.row} data-start={cell.start}
                    className={'manual-cell' + (selected.has(cell.start) ? ' is-selected' : '')}
                    disabled={saving || !cell.enabled} tabIndex={cell.start === tabStop ? 0 : -1}
                    aria-label={`${formatTime(cell.start)}, 15 minutes${cell.enabled ? '' : ', unavailable for the group'}`}
                    aria-pressed={selected.has(cell.start)} title={formatTime(cell.start)}
                    onPointerDown={event => begin(event, cell)}
                    onPointerEnter={() => setHovered(cell.start)} onFocus={() => {setFocused(cell.start); setHovered(cell.start)}} onKeyDown={event => key(event, cell)}
                    onClick={event => {if (event.detail === 0) setSelected(previous => {const next = new Set(previous); if (next.has(cell.start)) next.delete(cell.start); else next.add(cell.start); return next})}}
                  >{cells.length > 1 && <span>{formatTime(cell.start).split(' ').at(-1)}</span>}</button>) : <span className="manual-cell is-unavailable"/>}
                </div>;
              })}
            </div>)}
          </div>
        </div>
        <div className="manual-legend"><span><i className="manual-key selected"/>Your times</span><span><i className="manual-key open"/>Still available</span><span><i className="manual-key blocked"/>Unavailable</span><button type="button" className="text-button" disabled={saving || !selected.size} onClick={() => setSelected(new Set())}>Clear</button></div>
        <div className="manual-selection-status" role="status">{hovered ? formatTime(hovered) : 'Click and drag to mark times. Drag again to clear.'}</div>
        <p className="sr-only">Use arrow keys to move between available times, and Space or Enter to select. Selected times are saved when you submit this form.</p>
        <div className="manual-identity">
          <label className="field">Your name<input name="name" autoComplete="name" maxLength={100} required value={name} disabled={saving} onChange={event => setName(event.target.value)}/></label>
          <label className="field">Email for your invitation<input name="email" type="email" autoComplete="email" maxLength={254} required value={email} disabled={saving} onChange={event => setEmail(event.target.value)}/></label>
        </div>
        <div className="manual-submit"><p>{selected.size ? hasMeeting ? `${selected.size * 15} minutes marked across these dates.` : `Mark at least ${data.constraints.duration} minutes in a row.` : 'Mark all the remaining times that work for you.'}</p><button type="submit" className="primary" disabled={saving || !hasMeeting}>{saving ? 'Saving…' : 'Save availability'} {saving ? null : <Check size={16}/>}</button></div>
      </> : <div className="manual-empty"><CalendarDays size={26}/><h3>No shared times remaining</h3><p>There isn’t a full meeting time that works for everyone who has joined. Ask the organizer to adjust the dates or meeting length.</p><button type="button" className="outline" onClick={onClose}>Back to meeting <ArrowRight size={14}/></button></div>}
    </form>}
    {error && <p className="manual-error" role="alert">{error}</p>}
  </dialog>;
}
