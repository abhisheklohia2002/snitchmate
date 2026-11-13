import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Db } from '../core/db';
import { AuthService } from '../auth/auth.service';
import { must, parse } from '../core/http';

const uuid=z.string().uuid();
const registration=z.object({
 displayName:z.string().trim().min(3).max(100),
 vehicleType:z.enum(['BICYCLE','BIKE','SCOOTER','CAR']),
 servicePincode:z.string().regex(/^\d{6}$/)
});
@Controller()
export class DeliveryPartnersController {
 constructor(private readonly db:Db,private readonly auth:AuthService){}
 @Post('delivery/onboarding') async register(@Req() req:Request,@Body() body:unknown){
  const actor=await this.auth.require(req),input=parse(registration,body);
  const zone=await this.db.serviceZone.findFirst({where:{pincode:input.servicePincode,active:true}});
  must(zone,'Outside active delivery service zones','conflict');
  const current=await this.db.deliveryPartner.findUnique({where:{userId:actor.id}});
  must(!current,'Already registered as a delivery partner','conflict');
  return this.db.deliveryPartner.create({data:{userId:actor.id,...input}});
 }
 @Get('delivery/me') async me(@Req() req:Request){
  const actor=await this.auth.require(req);
  return this.db.deliveryPartner.findUnique({where:{userId:actor.id}});
 }
 @Patch('delivery/availability') async availability(@Req() req:Request,@Body() body:unknown){
  const actor=await this.auth.require(req),input=parse(z.object({available:z.boolean()}),body);
  const partner=await this.db.deliveryPartner.findUnique({where:{userId:actor.id}});
  must(partner?.status==='APPROVED','Delivery partner verification required','forbidden');
  return this.db.deliveryPartner.update({where:{id:partner.id},data:{available:input.available}});
 }
 @Get('delivery/jobs/available') async available(@Req() req:Request){
  const actor=await this.auth.require(req);
  const partner=await this.db.deliveryPartner.findUnique({where:{userId:actor.id}});
  must(partner?.status==='APPROVED'&&partner.available,'Go online after approval to see jobs','forbidden');
  // Unassigned jobs only; public summary excludes private customer details.
  const jobs=await this.db.logisticsJob.findMany({
    where:{courierId:null,status:{in:['UNASSIGNED','PICKUP_SCHEDULED']},
      order:{OR:[
        {pickupAddress:{pincode:partner.servicePincode}},
        {returnAddress:{pincode:partner.servicePincode}},
        {tailor:{pincode:partner.servicePincode}}
      ]}},
    select:{id:true,direction:true,status:true,scheduledAt:true,order:{select:{orderNumber:true,
      tailor:{select:{shopName:true,pincode:true}},
      pickupAddress:{select:{pincode:true}},
      returnAddress:{select:{pincode:true}}}}},orderBy:{createdAt:'desc'},take:40
  });
  return jobs;
 }
 @Post('delivery/jobs/:id/accept') async accept(@Req() req:Request,@Param('id') id:string){
  const actor=await this.auth.require(req),jobId=parse(uuid,id);
  const partner=await this.db.deliveryPartner.findUnique({where:{userId:actor.id}});
  must(partner?.status==='APPROVED'&&partner.available,'Approved online partner required','forbidden');
  const claimed=await this.db.$transaction(async tx=>{
   const job=await tx.logisticsJob.findUnique({where:{id:jobId},include:{order:{include:{pickupAddress:true,returnAddress:true,tailor:true}}}});
   must(job,'Delivery job not found','notfound');
   must([
     job.order.pickupAddress.pincode,job.order.returnAddress.pincode,job.order.tailor.pincode
   ].includes(partner.servicePincode),'Job outside your registered zone','forbidden');
   const changed=await tx.logisticsJob.updateMany({where:{id:jobId,courierId:null,status:{in:['UNASSIGNED','PICKUP_SCHEDULED']}},data:{courierId:actor.id,status:'ASSIGNED'}});
   must(changed.count===1,'Delivery job already taken','conflict');
   await tx.auditLog.create({data:{actorId:actor.id,action:'DELIVERY_JOB_ACCEPTED',resource:'LOGISTICS',resourceId:jobId}});
   return tx.logisticsJob.findUniqueOrThrow({where:{id:jobId},select:{id:true,direction:true,status:true,packageId:true,scheduledAt:true}});
  });
  return claimed;
 }
 @Get('delivery/jobs') async myJobs(@Req() req:Request) {
  const actor=await this.auth.require(req);
  const partner=await this.db.deliveryPartner.findUnique({where:{userId:actor.id}});
  must(partner?.status==='APPROVED','Delivery partner verification required','forbidden');
  return this.db.logisticsJob.findMany({where:{courierId:actor.id},select:{
    id:true,direction:true,status:true,packageId:true,scheduledAt:true,sealId:true,attempts:true,
    order:{select:{orderNumber:true,tailor:{select:{shopName:true,address:true,pincode:true}},
    pickupAddress:{select:{name:true,phone:true,line1:true,city:true,pincode:true}},
    returnAddress:{select:{name:true,phone:true,line1:true,city:true,pincode:true}},items:{select:{quantity:true}}}},
    handoffs:{select:{step:true,occurredAt:true}}
  },orderBy:{createdAt:'desc'},take:100});
 }
 @Get('admin/delivery-partners') async all(@Req() req:Request) {
  await this.auth.require(req,['admin']);
  return this.db.deliveryPartner.findMany({select:{id:true,displayName:true,vehicleType:true,
    status:true,servicePincode:true,available:true,user:{select:{phone:true}}},orderBy:{createdAt:'desc'},take:100});
 }
 @Post('admin/delivery-partners/:id/approve') async approve(@Req() req:Request,@Param('id') id:string){
  const actor=await this.auth.require(req,['admin']),partnerId=parse(uuid,id);
  return this.db.$transaction(async tx=>{
    const partner=await tx.deliveryPartner.findUnique({where:{id:partnerId}});
    must(partner?.status==='PENDING','Only pending applications can be approved','conflict');
    await tx.deliveryPartner.update({where:{id:partnerId},data:{status:'APPROVED',reviewedAt:new Date()}});
    const role=await tx.userRole.findFirst({where:{userId:partner.userId,role:'courier'}});
    if(!role)await tx.userRole.create({data:{userId:partner.userId,role:'courier'}});
    await tx.auditLog.create({data:{actorId:actor.id,action:'DELIVERY_PARTNER_APPROVED',resource:'USER',resourceId:partner.userId}});
    return {approved:true};
  });
 }
 @Post('admin/delivery-partners/:id/suspend') async suspend(@Req() req:Request,@Param('id') id:string){
  const actor=await this.auth.require(req,['admin']),partnerId=parse(uuid,id);
  const result=await this.db.$transaction(async tx=>{
    const partner=await tx.deliveryPartner.findUnique({where:{id:partnerId}});
    must(partner,'Partner not found','notfound');
    await tx.deliveryPartner.update({where:{id:partner.id},data:{status:'SUSPENDED',available:false}});
    // Remove courier role only for partner-app riders; existing assigned jobs stay visible to operations.
    await tx.userRole.deleteMany({where:{userId:partner.userId,role:'courier'}});
    await tx.auditLog.create({data:{actorId:actor.id,action:'DELIVERY_PARTNER_SUSPENDED',resource:'USER',resourceId:partner.userId}});
    return {suspended:true};
  });
  return result;
 }
}