// Transport-independent decisions, shared by Slack mentions and consent resumption.
export function resolveSlackFollowup(rows:any[],scope:{team:string;channel:string;user:string;thread?:string}){
 const scoped=rows.filter(r=>r.team_id===scope.team&&r.channel_id===scope.channel);
 const exact=scope.thread?scoped.find(r=>r.thread_ts===scope.thread||r.invitation_ts===scope.thread):null;
 if(exact)return {meeting:exact,ambiguous:false};
 if(scope.thread)return {meeting:null,ambiguous:false};
 const owned=scoped.filter(r=>r.organizer_id===scope.user&&!r.finalized);
 return {meeting:owned.length===1?owned[0]:null,ambiguous:owned.length>1};
}
export type BookingDependencies={
 read:()=>Promise<any>;refresh:()=>Promise<void>;organizer:()=>Promise<string|null>;
 authorize:(participant:string)=>Promise<any>;slots:()=>Promise<any>;
 book:(choice:{slotId:string;revision:number})=>Promise<any>;pending:(value:boolean)=>Promise<void>;
};
export async function runSlackBooking(d:BookingDependencies){
 let m=await d.read();
 if(m.calendarEventCreated){await d.pending(false);return {kind:'booked',meeting:m}}
 if(m.finalTime&&!m.finalTime.slotId){await d.pending(false);return {kind:'web_finalized',meeting:m}}
 if(m.status==='awaiting_responses'||m.responseSummary.waitingFor.length||!m.responseSummary.responded){await d.pending(false);return {kind:'waiting',meeting:m}}
 const participant=await d.organizer();
 if(!participant){await d.pending(false);return {kind:'organizer_missing',meeting:m}}
 // This flag only follows an explicit booking request, and survives the consent round trip.
 await d.pending(true);
 const auth=await d.authorize(participant);
 if(!auth.authorized)return {kind:'consent',meeting:m,authorizationUrl:auth.authorizationUrl};
 let choice;
 if(m.finalTime)choice={slotId:m.finalTime.slotId,revision:m.finalTime.basedOnRevision};
 else{
  await d.refresh();m=await d.read();
  if(m.calendarEventCreated){await d.pending(false);return {kind:'booked',meeting:m}}
  if(m.finalTime) return {kind:'changed',meeting:m};
  if(m.status==='awaiting_responses'||m.responseSummary.waitingFor.length||!m.responseSummary.responded){await d.pending(false);return {kind:'waiting',meeting:m}}
  const available=await d.slots();
  if(!available.slots.length){await d.pending(false);return {kind:'no_overlap',meeting:m}}
  choice={slotId:available.slots[0].id,revision:available.revision};
 }
 const result=await d.book(choice);
 if(result.calendarEventCreated)await d.pending(false);
 return {kind:result.calendarEventCreated?'booked':'delivery_pending',meeting:result};
}
