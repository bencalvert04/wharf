import {type Constraints} from './availability.ts';

export type PendingMeeting = {
 id:string;
 constraints:Constraints;
 isPlanner:boolean;
 joined:boolean;
 canRejoin:boolean;
 lastActivityAt:string;
 attendeeCount:number;
 plannerName:string|null;
 attendees:{name:string}[];
};

// Hidden after seven elapsed days without a deliberate visit or scheduling change.
export function isPendingMeeting(c:Constraints, finalTime:unknown=null,lastActivity?:string|number,now=Date.now()) {
 return !c.demo && finalTime == null && (lastActivity===undefined||now-(typeof lastActivity==='number'?lastActivity:Date.parse(lastActivity))<7*86400000);
}
