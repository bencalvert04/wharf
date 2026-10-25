// Accept requests from the origin serving this deployment, including its aliases.
export function isSameOrigin(request:Request,configuredUrl:string) {
 const origin=request.headers.get('origin');
 if(!origin)return true;
 return origin===new URL(request.url).origin||origin===new URL(configuredUrl).origin;
}
