/* Dedicated FREE staging deployment. Never migrates the live public schema. */
const {spawn,spawnSync} = require('node:child_process');
const base=process.env.STITCHMATE_STAGING_DB_BASE_URL;
if(!base)throw new Error('Missing dedicated STITCHMATE_STAGING_DB_BASE_URL reference');
const url=new URL(base);
if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('Expected PostgreSQL connection');
if(process.env.NODE_ENV==='production')throw new Error('This staging entrypoint must not start in NODE_ENV=production');
url.searchParams.set('schema','stitchmate_gigs_staging');
const env={...process.env,DATABASE_URL:url.toString()};
for(const args of [['--filter','@stitchmate/api','prisma:deploy'],['--filter','@stitchmate/api','prisma:seed'],['--filter','@stitchmate/api','exec','tsx','prisma/staging-seed.ts']]){
 const result=spawnSync('pnpm',args,{env,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0){console.error('Staging bootstrap command failed');process.exit(result.status||1);}
}
const child=spawn('pnpm',['--filter','@stitchmate/api','start'],{stdio:'inherit',env});
child.on('error',e=>{console.error('Staging API launch failed',e.message);process.exit(1);});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
child.on('exit',(code,signal)=>{if(signal){process.exit(0);}process.exit(code??1);});
