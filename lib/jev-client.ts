export type JevQuestion={type:'choice';instructions:string;criteria:Record<string,unknown>}|{type:'noul';instructions:string};
export type JevAnswer={type:'choice';choice:string;probabilities:Record<string,number>;confidence?:number}|{type:'noul';noul:number};
export const JEV_THRESHOLD=0.7;
export async function askJev(state:unknown,questions:Record<string,JevQuestion>){
 const key=process.env.TYPESAFE_API_KEY;
 if(!key)throw Error('Jev is not configured');
 const started=Date.now();
 const response=await fetch('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(4000),body:JSON.stringify({model:process.env.TYPESAFE_MODEL||'jev-latest',state,questions})});
 if(!response.ok)throw Error(`Jev unavailable (${response.status})`);
 const data=await response.json();
 for(const [name,q] of Object.entries(questions)){
  const a=data.answers?.[name];
  if(a?.type!==q.type)throw Error('Incomplete Jev response');
  if(q.type==='choice'&&(!(a.choice in q.criteria)||!Number.isFinite(a.probabilities?.[a.choice])||a.probabilities[a.choice]<0||a.probabilities[a.choice]>1))throw Error('Invalid Jev choice');
  if(q.type==='noul'&&(!Number.isFinite(a.noul)||a.noul<0||a.noul>1))throw Error('Invalid Jev probability');
 }
 console.info('Jev interpretation',{durationMs:Date.now()-started,model:data.model,inputTokens:data.usage?.input_tokens,outputTokens:data.usage?.output_tokens});
 return data.answers as Record<string,JevAnswer>;
}
export function acceptedChoice(answer:JevAnswer,threshold=JEV_THRESHOLD){return answer.type==='choice'&&answer.probabilities[answer.choice]>=threshold?answer.choice:null}
