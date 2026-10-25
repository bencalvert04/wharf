import {type Constraints} from './availability.ts';

export type PendingMeeting = {
 id:string;
 constraints:Constraints;
 isPlanner:boolean;
 joined:boolean;
 attendeeCount:number;
 plannerName:string|null;
 attendees:{name:string}[];
};

// Keep the final-time integration here so it can follow the planner feature's
// storage contract when that feature lands. No separate meeting status is needed.
export function isPendingMeeting(c:Constraints, finalTime:unknown=null) {
 return !c.demo && finalTime == null;
}
