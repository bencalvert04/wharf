/** Best-effort cleanup must never turn a successful action into a failed job. */
export async function dismissSlackPrompt(responseUrl:unknown){
 if(typeof responseUrl!=='string')return;
 let url:URL;try{url=new URL(responseUrl)}catch{return}
 if(url.protocol!=='https:'||url.hostname!=='hooks.slack.com'||url.port||url.username||url.password||!url.pathname.startsWith('/services/'))return;
 try{
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({delete_original:true}),redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok)console.warn('Slack prompt dismissal failed');
 }catch{console.warn('Slack prompt dismissal failed')}
}
