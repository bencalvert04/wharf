'use client';

import {useEffect, useRef} from 'react';
import {CalendarDays, MousePointer2, X} from 'lucide-react';

export default function AttendanceMethod({onClose, onCalendar, onManual}: {
  onClose: () => void;
  onCalendar: () => void;
  onManual: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  return <dialog ref={dialog} className="calendar-picker modal" aria-labelledby="attendance-method-title"
    onCancel={event => {event.preventDefault(); onClose()}}>
    <button type="button" className="modal-close icon-button" aria-label="Close availability options" onClick={onClose}><X size={18}/></button>
    <h2 id="attendance-method-title">Share your availability</h2>
    <p>Choose how to add your available times.</p>
    <div className="calendar-provider-options">
      <button type="button" className="calendar-provider-option" onClick={onCalendar}><CalendarDays size={20}/>Connect calendar</button>
      <button type="button" className="calendar-provider-option" onClick={onManual}><MousePointer2 size={20}/>Enter times manually</button>
    </div>
  </dialog>;
}
