// Slack ownership always takes precedence over browser ownership or a shared key.
export function plannerAllowed(session:{id:string;google_sub?:string|null}|null,ownerSession:string|null,slack:{google_sub:string|null}|null,keyAllowed=false){
 if(slack)return !!session?.google_sub&&!!slack.google_sub&&session.google_sub===slack.google_sub;
 return !!session&&session.id===ownerSession||keyAllowed;
}
