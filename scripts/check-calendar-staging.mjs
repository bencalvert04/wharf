import {readFileSync,statSync} from 'node:fs';
import {parseArgs,parseEnv} from 'node:util';
import {pathToFileURL} from 'node:url';

// Offline only: never contacts a provider/database, writes configuration, rotates
// a key, or prints credential values. Read only the explicitly selected file.
export function checkCalendarStaging(env,{appUrl,databaseHost}){
 const errors=[];
 for(const name of ['DATABASE_URL','APP_URL','GOOGLE_TOKEN_ENCRYPTION_KEY','MICROSOFT_CLIENT_ID','MICROSOFT_CLIENT_SECRET','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','INVITATION_FROM','GMAIL_APP_PASSWORD']){
  if(!env[name]?.trim())errors.push(`Missing ${name}.`);
 }
 let app;
 try{
  app=new URL(env.APP_URL);
  if(app.origin!==env.APP_URL||app.href!==new URL(appUrl).href||app.username||app.password)throw Error();
  const local=['localhost','127.0.0.1','[::1]'].includes(app.hostname);
  if(app.protocol!=='https:'&&!(local&&app.protocol==='http:'))throw Error();
  if(['wharfmeetings.com','www.wharfmeetings.com'].includes(app.hostname))throw Error();
 }catch{errors.push('APP_URL must match the approved staging origin exactly, with HTTPS (or localhost HTTP), no path or trailing slash, and no production domain.');}
 try{
  const db=new URL(env.DATABASE_URL);
  if(!['postgres:','postgresql:'].includes(db.protocol)||!databaseHost||db.hostname!==databaseHost||!db.username||!db.password||db.pathname.length<2)throw Error();
  if(!['require','verify-full'].includes(db.searchParams.get('sslmode')))throw Error();
 }catch{errors.push('DATABASE_URL must use the approved isolated database hostname, database name, credentials, and sslmode=require or verify-full.');}
 if(!/^[a-fA-F0-9]{64}$/.test(env.GOOGLE_TOKEN_ENCRYPTION_KEY||''))errors.push('GOOGLE_TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters. Keep the existing staging key stable.');
 if(!/^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/.test(env.MICROSOFT_CLIENT_ID||''))errors.push('MICROSOFT_CLIENT_ID must be an Entra application UUID.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.INVITATION_FROM||''))errors.push('INVITATION_FROM must be the approved sender email address.');
 return {errors,callbacks:errors.length?[]:['google','microsoft'].map(provider=>`${app.origin}/api/auth/${provider}/callback`)};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const {values}=parseArgs({options:{'env-file':{type:'string'},'expected-app-url':{type:'string'},'expected-db-host':{type:'string'}}});
  if(!values['env-file']||!values['expected-app-url']||!values['expected-db-host'])throw Error();
  const file=values['env-file'];
  if((statSync(file).mode&0o077)!==0){console.error('Staging env file must be readable only by its owner (chmod 600).');process.exitCode=1;}
  else{
   const result=checkCalendarStaging(parseEnv(readFileSync(file,'utf8')),{appUrl:values['expected-app-url'],databaseHost:values['expected-db-host']});
   if(result.errors.length){for(const error of result.errors)console.error(error);process.exitCode=1;}
   else{
    console.log('Offline configuration checks passed. No credentials were changed or tested.');
    for(const callback of result.callbacks)console.log(`Register exact Web callback: ${callback}`);
    console.log('Still verify database ownership/isolation, stable key provenance, Microsoft secret expiration, registered callbacks, and approved sender/recipients before migrations or live tests.');
   }
  }
 }catch{
  console.error('Could not read staging configuration. Use --env-file <private-file> --expected-app-url <approved-origin> --expected-db-host <approved-host>.');
  process.exitCode=1;
 }
}
