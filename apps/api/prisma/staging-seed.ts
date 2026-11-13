import {PrismaClient} from '@prisma/client';
const db=new PrismaClient();
async function main(){
 const url=new URL(process.env.DATABASE_URL??'');
 if(url.searchParams.get('schema')!=='stitchmate_gigs_staging')throw new Error('Staging fixtures must never target the live schema');
 const category=await db.serviceCategory.findUniqueOrThrow({where:{code:'HEM'}});
 const owner=await db.user.upsert({where:{phone:'+910000000001'},update:{},create:{phone:'+910000000001',name:'Staging demonstration tailor'}});
 const tailor=await db.tailor.upsert({
  where:{slug:'stitchmate-staging-demo-tailor'},
  update:{status:'APPROVED'},
  create:{ownerId:owner.id,slug:'stitchmate-staging-demo-tailor',shopName:'StitchMate Demo Tailor',
   description:'Sample tailoring shop for staging — no real bookings or deliveries',pincode:'110086',
   address:'Demo workspace, Delhi',status:'APPROVED',verifiedAt:new Date()}
 });
 await db.tailorZone.upsert({where:{tailorId_pincode:{tailorId:tailor.id,pincode:'110086'}},create:{tailorId:tailor.id,pincode:'110086'},update:{active:true}});
 await db.tailorService.upsert({where:{tailorId_categoryId:{tailorId:tailor.id,categoryId:category.id}},create:{tailorId:tailor.id,categoryId:category.id,basePricePaise:29900n,minDays:3,maxDays:7},update:{active:true}});
 const gig=await db.gig.upsert({where:{slug:'stitchmate-staging-jeans-alterations'},update:{status:'PUBLISHED'},create:{
  tailorId:tailor.id,categoryId:category.id,slug:'stitchmate-staging-jeans-alterations',
  title:'Demo — Expert jeans alterations and hemming',
  description:'This is a demonstration tailoring gig for isolated staging only. Explore packages and the customer booking interface without making real payments.',
  status:'PUBLISHED'
 }});
 const packs=[
  {tier:'BASIC',title:'Essential hemming',description:'Standard denim length alteration and tidy stitching',pricePaise:29900n,deliveryDays:7,revisions:1},
  {tier:'STANDARD',title:'Premium fitting',description:'Accurate trouser alterations with extra fitting review',pricePaise:49900n,deliveryDays:5,revisions:2},
  {tier:'PREMIUM',title:'Priority tailoring',description:'Priority alterations with special attention to finish',pricePaise:79900n,deliveryDays:3,revisions:3}
 ];
 for(const p of packs)await db.gigPackage.upsert({where:{gigId_tier:{gigId:gig.id,tier:p.tier}},create:{gigId:gig.id,...p},update:p});
 console.info('Staging-only demo gig configured');
}
main().then(()=>db.$disconnect()).catch(e=>{console.error('Staging demo seed failed',e.message);process.exitCode=1;}).finally(()=>db.$disconnect());