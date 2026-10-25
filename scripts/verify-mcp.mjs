import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdtemp,rm,readFile,readdir,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {neon} from '@neondatabase/serverless';
const sql=neon(process.env.DATABASE_URL),dir=await mkdtemp(resolve('../../work/mcp-check-')),base=process.env.TEST_URL||'http://127.0.0.1:3004';let client,id;
async function start(){client=new Client({name:'wharf-integration-check',version:'1.0.0'});await client.connect(new StdioClientTransport({command:process.execPath,args:['scripts/mcp.mjs'],env:{PATH:process.env.PATH,WHARF_URL:base,WHARF_STATE_DIR:dir},stderr:'pipe'}));}
async function call(name,args={}){const r=await client.callTool({name,arguments:args});return {error:r.isError,data:r.structuredContent||JSON.parse(r.content[0].text)}}
try{
 await start();const tools=await client.listTools();assert.equal(tools.tools.length,5);assert.ok(tools.tools.every(t=>t.inputSchema.type==='object'));
 const guide=await client.readResource({uri:'wharf://guide'});assert.ok(guide.contents[0].text.includes('snapshot'));
 const args={idempotencyKey:'mcp-integration-check',startDate:'2030-01-07',timezone:'UTC',participants:[{id:'ray',name:'Ray'}]};
 const first=await call('wharf_create_meeting',args);assert.ok(!first.error,JSON.stringify(first.data));id=first.data.id;assert.equal(first.data.status,'awaiting_responses');
 const list=await call('wharf_list_meetings');assert.equal(list.data.meetings[0].id,id);assert.ok(!JSON.stringify(list.data).includes('key'));
 const folders=await readdir(dir),file=join(dir,folders[0],'meetings.json');assert.equal((await stat(file)).mode&0o777,0o600);
 const stored=JSON.parse(await readFile(file,'utf8')),key=Object.values(stored.requests)[0].key;assert.ok(key);assert.ok(!JSON.stringify(first.data).includes(key));
 await client.close();await start();const second=await call('wharf_create_meeting',args);assert.equal(second.data.id,id);assert.equal(second.data.replayed,true);
 assert.equal((await call('wharf_get_meeting',{meetingId:id})).data.status,'awaiting_responses');
 assert.equal((await call('wharf_get_slots',{meetingId:id})).data.total,0);
 assert.ok((await call('wharf_finalize_meeting',{meetingId:id,slotId:'invalid',revision:0})).error);
 assert.ok((await call('wharf_get_meeting',{meetingId:'unknown'})).error);
 console.log('Official MCP client passed: initialize, discovery, guide, create, list, restart/retry recovery, status, slots, structured errors and private credential storage.');
}finally{await client?.close();if(id)await sql`DELETE FROM requests WHERE id=${id}`;await rm(dir,{recursive:true,force:true})}
