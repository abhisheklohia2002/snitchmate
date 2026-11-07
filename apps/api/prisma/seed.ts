import {PrismaClient} from '@prisma/client';
const prisma = new PrismaClient();
const categories = [
 ['MENS_SHIRT','Men’s shirt','CUSTOM_STITCHING',95000],
 ['MENS_TROUSERS','Men’s trousers','CUSTOM_STITCHING',95000],
 ['KURTA_PAJAMA','Kurta & pajama','CUSTOM_STITCHING',125000],
 ['WOMENS_SUIT','Women’s suit','CUSTOM_STITCHING',150000],
 ['BLOUSE','Blouse','CUSTOM_STITCHING',85000],
 ['DRESS','Custom dress','CUSTOM_STITCHING',175000],
 ['HEM','Trouser / dress hemming','ALTERATION',20000],
 ['WAIST','Waist adjustment','ALTERATION',35000],
 ['SLEEVE','Sleeve alteration','ALTERATION',25000],
 ['ZIPPER','Zipper replacement','ALTERATION',30000],
 ['REPAIR','Garment repair','ALTERATION',18000],
] as const;
async function main(){
 for(const pincode of (process.env.PILOT_PINCODES || '110086,110081,110042').split(',')){
  await prisma.serviceZone.upsert({where:{pincode},update:{active:true},create:{pincode}});
 }
 for (const [code,title,serviceType] of categories){
  await prisma.serviceCategory.upsert({where:{code},update:{title,active:true},create:{code,title,serviceType,description:`${title} by a verified local tailor`}});
 }
 const courierPhone=process.env.COURIER_BOOTSTRAP_PHONE;
 if(courierPhone){
  if(!/^\+[1-9]\d{7,14}$/.test(courierPhone))throw new Error('COURIER_BOOTSTRAP_PHONE must be E.164');
  const user=await prisma.user.upsert({where:{phone:courierPhone},update:{},create:{phone:courierPhone,name:'Pilot courier',roles:{create:{role:'customer'}}}});
  if(!await prisma.userRole.findFirst({where:{userId:user.id,role:'courier'}}))await prisma.userRole.create({data:{userId:user.id,role:'courier'}});
 }
 const phone = process.env.ADMIN_BOOTSTRAP_PHONE;
 if(phone){
  if(!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('ADMIN_BOOTSTRAP_PHONE must be E.164');
  const u=await prisma.user.upsert({where:{phone},update:{},create:{phone,name:'Operations administrator'}});
  const found=await prisma.userRole.findFirst({where:{userId:u.id,role:'admin'}});
  if(!found) await prisma.userRole.create({data:{userId:u.id,role:'admin'}});
  console.log('Admin role configured for supplied phone');
 }
 console.log('Seeded service zones and categories. Tailors must onboard and be approved by admin.');
}
main().finally(()=>prisma.$disconnect());
