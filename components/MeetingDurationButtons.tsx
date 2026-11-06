'use client';

import {useEffect} from 'react';

const presets = [15, 30, 45, 60];
export default function MeetingDurationButtons({value, onChange}: {value: number; onChange: (minutes: number) => void}) {
 const selected = Math.min(value, 120);
 useEffect(() => {if (value > 120) onChange(120)}, [value, onChange]);
 const index = presets.includes(selected) ? presets.indexOf(selected) : 4;
 return <div className="field">
  <label id="meeting-length-label">Meeting length</label>
  <div className="duration-buttons" role="group" aria-labelledby="meeting-length-label">
   <span className="duration-button-highlight" aria-hidden="true" style={{transform:`translateX(${index * 100}%)`}}/>
   {presets.map(minutes => <button type="button" key={minutes} aria-pressed={selected === minutes} onClick={() => onChange(minutes)}>{minutes === 60 ? '1 hr' : `${minutes} min`}</button>)}
   <select aria-label="Longer meeting length" className={index === 4 ? 'chosen' : ''} value={index === 4 ? selected : ''} onChange={event => onChange(Number(event.target.value))}>
    <option value="" disabled>More</option>
    <option value={75}>75 min</option><option value={90}>90 min</option><option value={105}>105 min</option><option value={120}>2 hr</option>
   </select>
  </div>
 </div>;
}
