import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

function key(){
 const value=process.env.GOOGLE_TOKEN_ENCRYPTION_KEY||'';
 if(!/^[a-fA-F0-9]{64}$/.test(value))throw new Error('Google token encryption is not configured.');
 return Buffer.from(value,'hex');
}
export function tokenVaultConfigured(){try{key();return true}catch{return false}}
export function sealToken(token:string,accountId:string){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
 cipher.setAAD(Buffer.from(accountId));
 const encrypted=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}
export function openToken(value:string,accountId:string){
 const [version,iv,tag,data,...extra]=value.split('.');
 if(version!=='v1'||!iv||!tag||!data||extra.length)throw new Error('Invalid encrypted token.');
 const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));
 decipher.setAAD(Buffer.from(accountId));
 decipher.setAuthTag(Buffer.from(tag,'base64url'));
 return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');
}
