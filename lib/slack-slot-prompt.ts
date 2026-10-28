import {slackBlocks,slackButton} from './slack-client.ts';
export function earliestSlotPrompt(id:string,available:{revision:number;slots:{id:string;start:string;end:string;timezone:string}[]}){
 const slot=[...available.slots].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start))[0];
 if(!slot){const text='Everyone’s calendar is connected, but no upcoming time fits everyone. Try a wider time range or shorter meeting.';return {text,blocks:slackBlocks(text,[])}}
 const date=new Intl.DateTimeFormat('en-US',{timeZone:slot.timezone,weekday:'short',month:'short',day:'numeric'}).format(new Date(slot.start));
 const time=new Intl.DateTimeFormat('en-US',{timeZone:slot.timezone,hour:'numeric',minute:'2-digit'});
 const text=`Looks like ${date}, ${time.format(new Date(slot.start))} to ${time.format(new Date(slot.end))} (${slot.timezone}) is free. Book meeting?`;
 return {text,blocks:slackBlocks(text,[slackButton('Book meeting','wharf_book',JSON.stringify({id,slotId:slot.id,revision:available.revision}))])};
}
