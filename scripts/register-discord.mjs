// Run with the same environment as the deployed app. Never prints credentials.
const id=process.env.DISCORD_APPLICATION_ID,token=process.env.DISCORD_BOT_TOKEN;
if(!id||!token)throw Error('Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN.');
const command={name:'wharf',description:'Find a shared meeting time with Wharf',type:1,integration_types:[0],contexts:[0],options:[
 {name:'request',description:'Meeting details or follow-up: 30 minutes tomorrow afternoon',type:3,required:true,max_length:4000},
 ...[1,2,3,4].map(i=>({name:`attendee_${i}`,description:'A person to include in this meeting',type:6,required:false})),
 {name:'timezone',description:'IANA timezone, for example America/Denver (default: America/Denver)',type:3,required:false}
]};
const response=await fetch(`https://discord.com/api/v10/applications/${id}/commands`,{method:'POST',headers:{Authorization:`Bot ${token}`,'Content-Type':'application/json'},body:JSON.stringify(command)});
if(!response.ok)throw Error(`Command registration failed (${response.status})`);
console.log('Registered /wharf.');
