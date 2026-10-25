// Only lost authorization should trigger consent. Outages and quota limits should be retryable.
export function needsCalendarConsent(error:unknown){
 const e=error as {response?:{status?:number;data?:{error?:string|{status?:string;errors?:{reason?:string}[]}}}};
 const response=e?.response,detail=response?.data?.error;
 return detail==='invalid_grant'||response?.status===401||
  (response?.status===403&&typeof detail==='object'&&
   (detail?.status==='UNAUTHENTICATED'||detail?.errors?.some(e=>e.reason==='insufficientPermissions')));
}
export function grantHasFreeBusy(scope:string|undefined){
 return !!scope?.split(/\s+/).includes('https://www.googleapis.com/auth/calendar.freebusy');
}
export function revocationComplete(status:number,body:unknown){
 return status===200||(status===400&&(body as {error?:string})?.error==='invalid_token');
}
