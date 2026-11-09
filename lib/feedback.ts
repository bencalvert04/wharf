export const feedbackRecipients=['raycshaw36@gmail.com','bencalvert04@gmail.com'];
export type Feedback={id:string;kind:'problem'|'idea';message:string;email:string;page:string};
export function parseFeedback(raw:unknown):Feedback|null{
 if(!raw||typeof raw!=='object')return null;
 const r=raw as Record<string,unknown>;
 if(typeof r.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(r.id))return null;
 if(r.kind!=='problem'&&r.kind!=='idea')return null;
 if(typeof r.message!=='string'||r.message.trim().length<10||r.message.length>3000)return null;
 const email=typeof r.email==='string'?r.email.trim():'';
 if(email&&(email.length>254||!/^[-a-zA-Z0-9.!#$%&'*+/=?^_`{|}~]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)))return null;
 const page=['home','create','results','pending','docs','support'].includes(String(r.page))?String(r.page):'other';
 return {id:r.id,kind:r.kind,message:r.message.trim(),email,page};
}
export function feedbackMessage(input:Feedback,sender:string){return {from:{name:'Wharf feedback',address:sender},to:feedbackRecipients,...(input.email?{replyTo:input.email}:{}),subject:input.kind==='problem'?'[Wharf] Problem report':'[Wharf] Product feedback',text:[input.kind==='problem'?'New problem report':'New product feedback','',input.message,'',`Reply email: ${input.email||'Not provided'}`,`Screen: ${input.page}`,`Report ID: ${input.id}`,'','Sent from the Wharf feedback form. No calendar data or meeting links were attached.'].join('\n'),disableFileAccess:true,disableUrlAccess:true}}
