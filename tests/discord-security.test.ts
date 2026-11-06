import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyDiscordSignature,canUseDiscordComponent,discordText} from '../lib/discord-security.ts';
test('Discord signatures cover the exact raw body, reject stale and malformed requests',()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const key=(publicKey.export({format:'der',type:'spki'}) as Buffer).subarray(-32).toString('hex');
 const now=1800000000000,timestamp=String(now/1000),body='{"type":1}';
 const signature=sign(null,Buffer.from(timestamp+body),privateKey).toString('hex');
 assert.equal(verifyDiscordSignature(body,timestamp,signature,key,now),true);
 assert.equal(verifyDiscordSignature(body+' ',timestamp,signature,key,now),false);
 assert.equal(verifyDiscordSignature(body,timestamp,signature,key,now+301000),false);
 assert.equal(verifyDiscordSignature(body,timestamp,'bad',key,now),false);
 assert.equal(verifyDiscordSignature(body,null,signature,key,now),false);
});
test('private actions bind to user and server/channel while DM actions retain the original owner',()=>{
 const row={team_id:'discord:123',channel_id:'channel',user_id:'owner'};
 const payload={guild_id:'123',channel_id:'channel',member:{user:{id:'owner'}}};
 assert.equal(canUseDiscordComponent(row,payload),true);
 assert.equal(canUseDiscordComponent(row,{...payload,guild_id:'456'}),false);
 assert.equal(canUseDiscordComponent(row,{...payload,channel_id:'elsewhere'}),false);
 assert.equal(canUseDiscordComponent(row,{...payload,member:{user:{id:'other'}}}),false);
 assert.equal(canUseDiscordComponent(row,{user:{id:'owner'},channel_id:'private-dm'}),true);
 assert.equal(canUseDiscordComponent({...row,user_id:null},{user:{id:'owner'}}),false);
 assert.equal(canUseDiscordComponent({...row,user_id:null},payload),true);
});
test('shared messages render Discord links without exposing Slack markup',()=>{
 assert.equal(discordText('Open <https://example.com/?a=1&amp;b=2|calendar> in Slack. @Wharf'), 'Open [calendar](https://example.com/?a=1&b=2) in Discord. /wharf');
});

import {conversationUrl} from '../lib/conversation-url.ts';
test('calendar callbacks return to the initiating platform',()=>{
 assert.equal(conversationUrl('discord:12345678901234567','23456789012345678'),'https://discord.com/channels/12345678901234567/23456789012345678');
 assert.equal(conversationUrl('T123','C456'),'https://app.slack.com/client/T123/C456');
});
