/** Keep calendar callbacks on the platform that initiated the meeting. */
export function conversationUrl(team:string,channel:string){
 if(/^discord:\d{17,20}$/.test(team))return `https://discord.com/channels/${encodeURIComponent(team.slice(8))}/${encodeURIComponent(channel)}`;
 return `https://app.slack.com/client/${encodeURIComponent(team)}/${encodeURIComponent(channel)}`;
}
