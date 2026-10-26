import {z} from 'zod';
import {validate,type Constraints} from './availability.ts';
export const createMeetingSchema=z.object({
 title:z.string().trim().min(1).max(100).default('Meeting'),
 startDate:z.iso.date(),endDate:z.iso.date().optional(),
 timezone:z.string().min(1).max(100),
 durationMinutes:z.number().int().min(15).max(480).default(30),
 dayStart:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('09:00'),
 dayEnd:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('17:00'),
 weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7).default([0,1,2,3,4,5,6]),
 participants:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),name:z.string().trim().min(1).max(100)}).strict()).min(1).max(20)
}).strict().superRefine((v,ctx)=>{
 if(new Set(v.participants.map(p=>p.id)).size!==v.participants.length)ctx.addIssue({code:'custom',path:['participants'],message:'Participant IDs must be unique.'});
 try{validate(toConstraints(v))}catch(e){ctx.addIssue({code:'custom',message:(e as Error).message})}
});
export type CreateMeeting=z.infer<typeof createMeetingSchema>;
export function toConstraints(v:CreateMeeting):Constraints{return {title:v.title,start:v.startDate,end:v.endDate||v.startDate,duration:v.durationMinutes,zone:v.timezone,from:v.dayStart,to:v.dayEnd,days:[...new Set(v.weekdays)].sort()}}
export const finalizeSchema=z.object({slotId:z.string().min(1).max(100),revision:z.number().int().min(0)}).strict();
export const pageSchema=z.object({offset:z.coerce.number().int().min(0).max(100000).default(0),limit:z.coerce.number().int().min(1).max(100).default(20)}).strict();
export const createInputSchema=z.toJSONSchema(createMeetingSchema,{io:"input"});
export const finalizeInputSchema=z.toJSONSchema(finalizeSchema);

export const prepareCalendarSchema=z.object({organizerParticipantId:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)}).strict();
export const prepareCalendarInputSchema=z.toJSONSchema(prepareCalendarSchema);
