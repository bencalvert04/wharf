import assert from 'node:assert/strict';
import {neon} from '@neondatabase/serverless';
import {createHash} from 'node:crypto';
const sql=neon(process.env.DATABASE_URL),base='http://127.0.0.1:3004';
assert.deepEqual(await fetch(base+'/api/auth/account').then(r=>r.json()),{user:null});
const r=await fetch(base+'/api/auth/google/start',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{}'});
assert.equal(r.status,200);const d=await r.json(),url=new URL(d.url),cookie=r.headers.get('set-cookie').split(';')[0],id=createHash('sha256').update(cookie.split('=')[1]).digest('hex');
try{
assert.equal(url.searchParams.get('scope'),'openid profile email');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
const [flow]=await sql`SELECT * FROM oauth_states WHERE session_id=${id}`;assert.equal(flow.meeting_id,null);
await sql`UPDATE sessions SET google_sub='synthetic-account-test',name='Test Account',picture='https://lh3.googleusercontent.com/test' WHERE id=${id}`;
const read=()=>fetch(base+'/api/auth/account',{headers:{Cookie:cookie}}).then(r=>r.json());
assert.deepEqual(await read(),{user:{name:'Test Account',picture:'https://lh3.googleusercontent.com/test',calendarConnected:false,calendarDisconnectPending:false}});
assert.equal((await fetch(base+'/api/auth/account',{method:'DELETE',headers:{Cookie:cookie,Origin:'https://invalid.example'}})).status,403);
assert.ok((await read()).user);
assert.equal((await fetch(base+'/api/auth/account',{method:'DELETE',headers:{Cookie:cookie,Origin:base}})).status,200);
assert.deepEqual(await read(),{user:null});
const [saved]=await sql`SELECT * FROM sessions WHERE id=${id}`;assert.ok(saved);assert.equal(saved.google_sub,null);assert.equal(saved.picture,null);
assert.equal((await sql`SELECT * FROM oauth_states WHERE session_id=${id}`).length,0);
console.log('Verified login-only scopes, PKCE, profile response, sign-out CSRF protection, pending-flow invalidation and preserved browser session.');
}finally{await sql`DELETE FROM oauth_states WHERE session_id=${id}`;await sql`DELETE FROM sessions WHERE id=${id}`}
