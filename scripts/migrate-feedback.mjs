// Vercel builds use the database configured for that deployment environment.
// Keep local builds offline; manual migrations remain available via db:migrate.
if(process.env.VERCEL==='1'){
 if(!process.env.DATABASE_URL)throw new Error('Feedback deployment requires DATABASE_URL.');
 const {neon}=await import('@neondatabase/serverless');
 const {feedbackSchema}=await import('../db/feedback-schema.mjs');
 const db=neon(process.env.DATABASE_URL);
 // Serialize concurrent deployments against the same database.
 await db.transaction([
  db`SELECT pg_advisory_xact_lock(1875309162)`,
  ...feedbackSchema.map(statement=>db.query(statement))
 ]);
 console.log('Feedback delivery tables ready.');
}
