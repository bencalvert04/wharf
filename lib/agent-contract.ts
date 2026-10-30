import {z} from 'zod';
import {validate,type Constraints} from './availability.ts';
export const createMeetingSchema=z.object({
 title:z.string().trim().min(1).max(100).default('Meeting'),
 startDate:z.iso.date(),endDate:z.iso.date().optional(),
 timezone:z.string().min(1).max(100),
 durationMinutes:z.number().int().min(15).max(480).default(30),
 dayStart:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('09:00'),
 dayEnd:z.string().regex(/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/).default('17:00'),
 windowMode:z.enum(['daily','continuous']).optional().describe('continuous means one uninterrupted interval from startDate/dayStart through endDate/dayEnd, including overnight hours; daily repeats the hours each day.'),
 dailyStart:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe('Optional daily lower limit within a continuous date range.'),
 dailyEnd:z.string().regex(/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/).optional().describe('Optional daily upper limit within a continuous date range.'),
 weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7).default([0,1,2,3,4,5,6]),
 openJoin:z.boolean().optional().describe('Anyone with invitationUrl may join. Omit participants for an open meeting; first person to connect becomes the human planner.'),
 participants:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),name:z.string().trim().min(1).max(100)}).strict()).max(1000).default([])
}).strict().superRefine((v,ctx)=>{
 if(v.openJoin?v.participants.length>0:v.participants.length===0)ctx.addIssue({code:'custom',path:['participants'],message:v.openJoin?'Open meetings do not reserve participants.':'Include at least one participant.'});
 if(new Set(v.participants.map(p=>p.id)).size!==v.participants.length)ctx.addIssue({code:'custom',path:['participants'],message:'Participant IDs must be unique.'});
 try{validate(toConstraints(v))}catch(e){ctx.addIssue({code:'custom',message:(e as Error).message})}
});
export type CreateMeeting=z.infer<typeof createMeetingSchema>;
export function toConstraints(v:CreateMeeting):Constraints{return {...(v.openJoin?{openJoin:true}:{}),title:v.title,start:v.startDate,end:v.endDate||v.startDate,duration:v.durationMinutes,zone:v.timezone,from:v.windowMode==='continuous'?(v.dailyStart||'00:00'):v.dayStart,to:v.windowMode==='continuous'?(v.dailyEnd||'24:00'):v.dayEnd,...(v.windowMode==='continuous'?{windowStart:`${v.startDate}T${v.dayStart}`,windowEnd:`${v.endDate||v.startDate}T${v.dayEnd}`}:{ }),days:[...new Set(v.weekdays)].sort()}}
export const finalizeSchema=z.object({slotId:z.string().min(1).max(100),revision:z.number().int().min(0)}).strict();
export const pageSchema=z.object({offset:z.coerce.number().int().min(0).max(100000).default(0),limit:z.coerce.number().int().min(1).max(100).default(20)}).strict();
export const createInputSchema={...z.toJSONSchema(createMeetingSchema,{io:"input"}),anyOf:[
 {properties:{openJoin:{const:true},participants:{maxItems:0}},required:['openJoin']},
 {properties:{openJoin:{const:false},participants:{minItems:1}},required:['participants']}
]};
export const finalizeInputSchema=z.toJSONSchema(finalizeSchema);

export const prepareCalendarSchema=z.object({organizerParticipantId:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)}).strict();
export const prepareCalendarInputSchema=z.toJSONSchema(prepareCalendarSchema);
