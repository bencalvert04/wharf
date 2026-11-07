import {after} from 'next/server';
import {refreshMeetingAvailability} from './meeting-refresh';
export function scheduleMeetingRefresh(id:string){
 after(async()=>{try{await refreshMeetingAvailability(id)}catch{console.warn('Meeting availability refresh did not complete.');}});
}
