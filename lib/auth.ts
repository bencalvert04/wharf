import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {cookies} from 'next/headers';
import {neon} from '@neondatabase/serverless';
export const sql=()=>neon(process.env.DATABASE_URL!);
export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export const token=()=>randomBytes(32).toString('base64url');
export const appUrl=()=>process.env.APP_URL||'http://localhost:3000';
export const sameOrigin=(r:Request)=>!r.headers.get('origin')||[new URL(appUrl()).origin,'https://wharfmeetings.com'].includes(r.headers.get('origin')!);
export function keyMatches(key:string,stored:string){const a=Buffer.from(stored.startsWith('sha256:')?'sha256:'+hash(key):key);const b=Buffer.from(stored);return a.length===b.length&&timingSafeEqual(a,b)}
export async function session(create=false){const jar=await cookies();const raw=jar.get('wharf_session')?.value;if(raw){const [s]=await sql()`SELECT * FROM sessions WHERE id=${hash(raw)} AND expires_at>now()`;if(s)return s}if(!create)return null;const secret=token();const id=hash(secret);await sql()`INSERT INTO sessions(id,expires_at) VALUES(${id},now()+interval '30 days')`;jar.set('wharf_session',secret,{httpOnly:true,secure:appUrl().startsWith('https:'),sameSite:'lax',path:'/',maxAge:2592000});return {id,google_sub:null}}
export async function meeting(id:string){const [r]=await sql()`SELECT * FROM requests WHERE id=${id} AND created_at::timestamptz>now()-interval '30 days'`;return r}
export const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
