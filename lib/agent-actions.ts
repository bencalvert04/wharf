type MeetingState = {
 id:string; openJoin:boolean; status:string; revision:number;
 participants:{id:string;status:string}[];
 finalTime:{slotId:string;basedOnRevision:number;start:string}|null;
 calendar:{status:string}|null;
 calendarAuthorization:{participantId:string;authorized:boolean}|null;
};
export type AgentAction = {
 id:string; description:string; method:'GET'|'POST'; url:string;
 authentication:'meeting_key'|'none';
 body?:Record<string,unknown>; requiredInput?:string[];
 tool?:{name:string;arguments:Record<string,unknown>};
 sendsInvitations:boolean; requiresUserChoice:boolean; pollAfterSeconds?:number;
};

// These are request templates, never instructions to pick a time or grant consent.
// Only include known values; requiredInput names the choices the agent still needs.
export function meetingActions(meeting:MeetingState,base:string,now=Date.now()):AgentAction[]{
 const path=`${base}/api/v1/meetings/${meeting.id}`;
 const actions:AgentAction[]=[{id:'check_status',description:'Read responses and refresh available actions.',method:'GET',url:path,authentication:'meeting_key',tool:{name:'wharf_get_meeting',arguments:{meetingId:meeting.id}},sendsInvitations:false,requiresUserChoice:false,...(meeting.status==='awaiting_responses'||meeting.calendar?.status==='pending'?{pollAfterSeconds:30}:{})}];
 if(meeting.openJoin){
  actions.push({id:'open_meeting',description:'Share this group link. The human planner chooses a time on the website; joined people are not an inferred complete roster.',method:'GET',url:`${base}/?meeting=${meeting.id}`,authentication:'none',sendsInvitations:false,requiresUserChoice:false});
  return actions;
 }
 if(meeting.calendar?.status==='created')return actions;
 const add=(id:string,description:string,suffix:string,name:string,body:Record<string,unknown>,requiredInput:string[],sendsInvitations=false)=>actions.push({id,description,method:'POST',url:path+suffix,authentication:'meeting_key',body,requiredInput,tool:{name,arguments:{meetingId:meeting.id,...body}},sendsInvitations,requiresUserChoice:requiredInput.length>0});
 const organizer=meeting.calendarAuthorization?.participantId;
 if(organizer||meeting.participants.some(p=>p.status==='responded'))add('prepare_calendar','Get a private consent link for the organizer. The organizer must approve it personally. Reuse the selected organizer to renew permission.','/calendar','wharf_prepare_calendar',organizer?{organizerParticipantId:organizer}:{},organizer?[]:['organizerParticipantId']);
 if(meeting.calendar?.status==='pending'&&meeting.finalTime){
  add('retry_booking','Retry the same queued event. This can send invitations; do not create a replacement meeting.','/book','wharf_book_meeting',{slotId:meeting.finalTime.slotId,revision:meeting.finalTime.basedOnRevision},[],true);
  actions[actions.length-1].pollAfterSeconds=30;
  return actions;
 }
 if(meeting.status==='ready'){
  actions.push({id:'get_slots',description:'Get more exact-duration options. The first five are already in availability.slots.',method:'GET',url:path+'/slots',authentication:'meeting_key',tool:{name:'wharf_get_slots',arguments:{meetingId:meeting.id}},sendsInvitations:false,requiresUserChoice:false});
  add('finalize','Save the user-authorized time in Wharf without sending invitations. Fill slotId from availability.slots or get_slots.','/finalize','wharf_finalize_meeting',{revision:meeting.revision},['slotId']);
 }
 if(meeting.calendarAuthorization?.authorized&&(meeting.status==='ready'||(meeting.finalTime&&Date.parse(meeting.finalTime.start)>now))){
  add('book','Create the organizer’s calendar event and send invitations. Use only a user-authorized slot choice. Provider permission is rechecked when booking.','/book','wharf_book_meeting',meeting.finalTime?{slotId:meeting.finalTime.slotId,revision:meeting.finalTime.basedOnRevision}:{revision:meeting.revision},meeting.finalTime?[]:['slotId'],true);
 }
 return actions;
}
