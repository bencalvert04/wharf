import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
for(const name of ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','APP_URL','CRON_SECRET']){const value=name==='CRON_SECRET'?randomBytes(32).toString('base64url'):process.env[name];if(!value)throw Error('Missing '+name);const r=spawnSync('npx',['--yes','vercel@65.2.0','env','add',name,'production','--scope','wharf1','--yes',...(name.includes('SECRET')?['--sensitive']:[])],{input:value,encoding:'utf8'});if(r.status!==0){console.error('Failed to configure '+name);process.exit(1)}console.log('Configured '+name)}
