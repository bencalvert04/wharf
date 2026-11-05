import {createPrivateKey} from 'node:crypto';
import {readFileSync,statSync} from 'node:fs';
import {parseArgs,parseEnv} from 'node:util';
import {pathToFileURL} from 'node:url';

// Offline only. Never prints values, contacts Apple, or changes credentials.
export function checkAppleConfig(env,{expectedAppUrl}={}){
 const errors=[];
 for(const key of ['APPLE_CLIENT_ID','APPLE_TEAM_ID','APPLE_KEY_ID','APPLE_PRIVATE_KEY']){
  if(!env[key]?.trim())errors.push(`Missing ${key}.`);
 }
 for(const key of ['APPLE_TEAM_ID','APPLE_KEY_ID']){
  if(env[key]?.trim()&&!/^[A-Z0-9]{10}$/.test(env[key]))errors.push(`${key} must contain ten uppercase letters or digits.`);
 }
 if(env.APPLE_CLIENT_ID?.trim()&&!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(env.APPLE_CLIENT_ID))errors.push('APPLE_CLIENT_ID must be a web Services ID.');
 let callback=null;
 try{
  const app=new URL(env.APP_URL);
  if(app.protocol!=='https:'||app.origin!==env.APP_URL||app.username||app.password||!app.hostname.includes('.')||app.hostname.endsWith('.localhost')||app.hostname==='127.0.0.1'||(expectedAppUrl&&env.APP_URL!==expectedAppUrl))throw Error();
  callback=app.origin+'/api/auth/apple/callback';
 }catch{errors.push('APP_URL must be the exact registered public HTTPS origin, without a path or trailing slash.');}
 if(env.APPLE_PRIVATE_KEY?.trim()){
  try{
   const pem=env.APPLE_PRIVATE_KEY.replace(/\\n/g,'\n');
   if(!pem.includes('-----BEGIN PRIVATE KEY-----'))throw Error();
   const key=createPrivateKey(pem);
   if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error();
  }catch{errors.push('APPLE_PRIVATE_KEY must be an unencrypted PKCS#8 P-256 private key from Apple.');}
 }
 return {errors,callback:errors.length?null:callback,calendarReady:false,limitations:[
  'An offline check cannot verify Apple registration, membership, website eligibility, key ownership, or callback reachability.',
  'Sign in with Apple authenticates identity only. iCloud Calendar requires separate Apple approval and integration credentials.',
 ]};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const {values}=parseArgs({options:{'env-file':{type:'string'},'expected-app-url':{type:'string'}}});
  if(!values['env-file']||!values['expected-app-url'])throw Error();
  if((statSync(values['env-file']).mode&0o077)!==0){console.error('Use an owner-only env file (chmod 600).');process.exitCode=1;}
  else{
   const result=checkAppleConfig(parseEnv(readFileSync(values['env-file'],'utf8')),{expectedAppUrl:values['expected-app-url']});
   for(const error of result.errors)console.error(error);
   if(result.errors.length)process.exitCode=1;
   else console.log(`Offline identity configuration checks passed. Register exact callback: ${result.callback}`);
   for(const limitation of result.limitations)console.log(limitation);
  }
 }catch{console.error('Use --env-file <private-file> --expected-app-url <registered-origin>. Configuration could not be checked.');process.exitCode=1;}
}
