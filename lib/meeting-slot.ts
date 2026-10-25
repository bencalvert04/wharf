import type {Window} from './availability.ts';
/** The parent window already begins on a local quarter-hour boundary. */
export function meetingSlot(window:Window,duration:number,position:number):Window{
 const length=Math.min(duration*60000,window.end-window.start);
 const step=15*60000;
 const last=Math.max(0,Math.floor((window.end-window.start-length)/step));
 const index=Math.min(last,Math.max(0,Math.floor(Math.max(0,Math.min(1,position))*(window.end-window.start)/step)));
 const start=window.start+index*step;
 return {...window,start,end:start+length};
}
