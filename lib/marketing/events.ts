export const marketingEvents=['page_view','create_started','meeting_created','attend_started','calendar_picker_opened','manual_opened','attendance_completed','invite_copied','finalize_started','meeting_finalized','action_error'] as const;
export type MarketingEvent=typeof marketingEvents[number];
export const marketingViews=['home','create','results','pending','docs','other'] as const;
export function campaignTag(value:unknown){return typeof value==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value)?value.toLowerCase():''}
export function marketingAdmin(email:unknown,allowlist:string|undefined){return typeof email==='string'&&!!allowlist?.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase())}
export function parseMarketingEvent(raw:unknown){
 if(!raw||typeof raw!=='object')return null;
 const r=raw as Record<string,unknown>;
 if(!marketingEvents.includes(r.event as MarketingEvent)||!marketingViews.includes(r.view as typeof marketingViews[number]))return null;
 if(typeof r.visit!=='string'||!/^[0-9a-f-]{36}$/i.test(r.visit)||typeof r.id!=='string'||!/^[0-9a-f-]{36}$/i.test(r.id))return null;
 return {id:r.id,visit:r.visit,event:r.event as MarketingEvent,view:r.view as string,source:campaignTag(r.source)||'direct',medium:campaignTag(r.medium)||'none',campaign:campaignTag(r.campaign)||'none',content:campaignTag(r.content)||'none',device:r.device==='mobile'?'mobile':r.device==='tablet'?'tablet':'desktop'};
}
