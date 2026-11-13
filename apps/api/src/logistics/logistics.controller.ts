import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Db } from '../core/db';
import { AuthService } from '../auth/auth.service';
import { OrdersService } from '../orders/orders.service';
import { must,parse } from '../core/http';
import { sendOtp } from '../core/otp-delivery';

const schedule=z.object({scheduledAt:z.string().datetime({offset:true})});
const proofSchema=z.object({step:z.enum(['SENDER_PICKUP','RECIPIENT_DROPOFF']),otp:z.string().regex(/^\d{6}$/),itemCount:z.number().int().min(1).max(100),sealId:z.string().min(3).max(100),conditionNote:z.string().min(3).max(1000),proofFileId:z.string().uuid()});
function otpHash(jobId:string,step:string,code:string){return createHmac('sha256',process.env.OTP_SECRET!).update(`${jobId}:${step}:${code}`).digest('hex');}
@Controller()
export class LogisticsController {
 constructor(private readonly db:Db,private readonly auth:AuthService,private readonly orders:OrdersService){}
 @Post('orders/:id/pickup-slots') async schedule(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.auth.require(req);const order=await this.orders.visible(id,actor);must(order.customerId===actor.id,'Not your order','forbidden');
  const input=parse(schedule,body);const time=new Date(input.scheduledAt);must(time.getTime()>Date.now()+60*60_000 && time.getTime()<Date.now()+21*86400_000,'Pickup must be 1 hour to 21 days in the future');
  must(order.status==='PAID' && order.paymentStatus==='PAID','Payment must be confirmed','conflict');
  return this.db.$transaction(async tx=>{await this.orders.transition(tx,order,'PICKUP_SCHEDULED',actor.id);const job=await tx.logisticsJob.create({data:{orderId:id,direction:'INBOUND',packageId:`PKG-${randomUUID().slice(0,12).toUpperCase()}`,scheduledAt:time,status:'PICKUP_SCHEDULED'}});return job;});
 }
 @Get('admin/logistics/jobs') async jobs(@Req() req:Request){await this.auth.require(req,['admin']);return this.db.logisticsJob.findMany({include:{order:{select:{orderNumber:true,status:true,tailor:{select:{shopName:true,address:true,pincode:true}},pickupAddress:true,returnAddress:true,items:{select:{quantity:true}}}}},orderBy:{createdAt:'desc'},take:100});}
 @Post('admin/logistics/jobs/:id/assign') async assign(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.auth.require(req,['admin']);const input=parse(z.object({courierId:z.string().uuid(),scheduledAt:z.string().datetime({offset:true}).optional()}),body);
  const job=await this.db.logisticsJob.findUnique({where:{id}});must(job && ['UNASSIGNED','PICKUP_SCHEDULED','FAILED_ATTEMPT','ASSIGNED'].includes(job.status),'Job cannot be assigned','conflict');
  const courier=await this.db.userRole.findFirst({where:{userId:input.courierId,role:'courier'}});must(courier,'Courier account not found');
  const alreadyPickedUp=!!await this.db.logisticsHandoff.findFirst({where:{jobId:id,step:'SENDER_PICKUP'}});
  const updated=await this.db.logisticsJob.update({where:{id},data:{courierId:input.courierId,status:alreadyPickedUp?'PICKED_UP':'ASSIGNED',...(input.scheduledAt?{scheduledAt:new Date(input.scheduledAt)}:{})}});
  await this.db.auditLog.create({data:{actorId:actor.id,action:'COURIER_ASSIGNED',resource:'LOGISTICS',resourceId:id,context:{courierId:input.courierId}}});return updated;
 }
 @Get('courier/jobs') async courierJobs(@Req() req:Request){const actor=await this.auth.require(req,['courier']);return this.db.logisticsJob.findMany({where:{courierId:actor.id},select:{id:true,direction:true,status:true,packageId:true,scheduledAt:true,order:{select:{orderNumber:true,tailor:{select:{shopName:true,address:true}},pickupAddress:{select:{name:true,phone:true,line1:true,city:true,pincode:true}},returnAddress:{select:{name:true,phone:true,line1:true,city:true,pincode:true}}}}}});}
 @Post('courier/jobs/:id/otp')
 @Post('admin/logistics/jobs/:id/otp') async issue(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.auth.require(req,['admin','courier']);const input=parse(z.object({step:z.enum(['SENDER_PICKUP','RECIPIENT_DROPOFF'])}),body);
  const job=await this.db.logisticsJob.findUnique({where:{id},include:{order:{include:{customer:true,tailor:{include:{owner:true}}}}}});must(job,'Job not found','notfound');
  must(job.courierId,'Assign a courier before issuing OTP','conflict');
  if(!actor.roles.includes('admin'))must(job.courierId===actor.id,'This delivery is not assigned to you','forbidden');
  must(['ASSIGNED','PICKED_UP'].includes(job.status),'Job is not ready for verification','conflict');
  must(input.step===(job.status==='ASSIGNED'?'SENDER_PICKUP':'RECIPIENT_DROPOFF'),
   'The handoff step does not match the current courier stage','conflict');
  const latestCode=await this.db.handoffCode.findFirst({where:{jobId:id,step:input.step,usedAt:null,createdAt:{gt:new Date(Date.now()-60_000)}},orderBy:{createdAt:'desc'}});
  must(!latestCode,'A handoff OTP was requested recently. Wait at least 60 seconds.','conflict');
  const isInbound=['INBOUND','REWORK_INBOUND'].includes(job.direction);
  const customerPhone=job.order.customer.phone,tailorPhone=job.order.tailor.owner.phone;
  const recipient=(input.step==='SENDER_PICKUP')?(isInbound?customerPhone:tailorPhone):(isInbound?tailorPhone:customerPhone);
  const code=String(randomInt(100000,1000000));
  const challenge=await this.db.handoffCode.create({data:{jobId:id,step:input.step,codeHash:otpHash(id,input.step,code),expiresAt:new Date(Date.now()+10*60_000)}});
  try {
    await sendOtp(recipient,code,'HANDOFF_OTP');
  } catch (error) {
    await this.db.handoffCode.delete({where:{id:challenge.id}});
    throw error;
  }
  await this.db.auditLog.create({data:{actorId:actor.id,action:'HANDOFF_OTP_SENT',resource:'LOGISTICS',resourceId:id,context:{step:input.step}}});
  return {sent:true,expiresInSeconds:600};
 }
 @Post('courier/jobs/:id/handoffs')
 @Post('admin/logistics/jobs/:id/handoffs') async handoff(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.auth.require(req,['admin','courier']);const input=parse(proofSchema,body);
  const job=await this.db.logisticsJob.findUnique({where:{id},include:{order:{include:{items:true}}}});must(job,'Job not found','notfound');
  must(job.courierId,'Courier assignment required','conflict');
  if(!actor.roles.includes('admin'))must(job.courierId===actor.id,'This delivery is not assigned to you','forbidden');
  const existing=await this.db.logisticsHandoff.findFirst({where:{jobId:id,step:input.step}});must(!existing,'Handoff has already been confirmed','conflict');
  const correctStep=input.step==='SENDER_PICKUP'?job.status==='ASSIGNED':job.status==='PICKED_UP';must(correctStep,'Handoff step out of sequence','conflict');
  const expected=job.order.items.reduce((s,item)=>s+item.quantity,0);
  must(input.itemCount===expected,'Parcel item count differs from order; open material issue','conflict');
  const file=await this.db.uploadedFile.findFirst({where:{id:input.proofFileId,status:'VERIFIED',purpose:'HANDOFF',ownerId:{in:[actor.id,job.courierId!]}}});must(file,'Verified handoff photograph required');
  const challenge=await this.db.handoffCode.findFirst({where:{jobId:id,step:input.step,usedAt:null,expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'}});
  must(challenge && challenge.attempts<5,'Handoff code expired or unavailable','conflict');
  const increased=await this.db.handoffCode.updateMany({where:{id:challenge.id,usedAt:null,attempts:{lt:5}},data:{attempts:{increment:1}}});must(increased.count===1,'Code cannot be used','conflict');
  const a=Buffer.from(challenge.codeHash,'hex'),b=Buffer.from(otpHash(id,input.step,input.otp),'hex');must(a.length===b.length&&timingSafeEqual(a,b),'Invalid handoff code','forbidden');
  const isInbound=['INBOUND','REWORK_INBOUND'].includes(job.direction),isSender=input.step==='SENDER_PICKUP';
  const isRework=job.direction==='REWORK_INBOUND';
  const to=isRework?(isSender?'REWORK_APPROVED':'REWORK_IN_PROGRESS'):isInbound?(isSender?'INBOUND_TRANSIT':'MATERIAL_RECEIVED'):(isSender?'OUTBOUND_TRANSIT':'DELIVERED');
  const expectedOrder=isRework?'REWORK_APPROVED':isInbound?(isSender?'PICKUP_SCHEDULED':'INBOUND_TRANSIT'):(isSender?'RETURN_PICKUP_SCHEDULED':'OUTBOUND_TRANSIT');
  must(job.order.status===expectedOrder,'Order stage does not allow this handoff','conflict');
  return this.db.$transaction(async tx=>{
   const spent=await tx.handoffCode.updateMany({where:{id:challenge.id,usedAt:null},data:{usedAt:new Date()}});must(spent.count===1,'Code already used','conflict');
   const record=await tx.logisticsHandoff.create({data:{jobId:id,step:input.step,fromParty:isSender?(isInbound?'CUSTOMER':'TAILOR'):'COURIER',toParty:isSender?'COURIER':(isInbound?'TAILOR':'CUSTOMER'),itemCount:input.itemCount,sealId:input.sealId,proofFileId:input.proofFileId,conditionNote:input.conditionNote,verifiedById:actor.id}});
   await tx.logisticsJob.update({where:{id},data:{status:isSender?'PICKED_UP':'DELIVERED',sealId:input.sealId}});
   if(to!==job.order.status)await this.orders.transition(tx,job.order,to,actor.id,`Custody verified: ${input.step}`);
   return record;
  });
 }
 @Post('admin/logistics/jobs/:id/fail-attempt') async fail(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.auth.require(req,['admin']);const input=parse(z.object({reason:z.string().min(10).max(1000),rescheduleAt:z.string().datetime({offset:true}).optional()}),body);
  const job=await this.db.logisticsJob.findUnique({where:{id}});must(job && !['DELIVERED','CANCELLED'].includes(job.status),'Job not active','conflict');
  await this.db.logisticsJob.update({where:{id},data:{status:'FAILED_ATTEMPT',attempts:{increment:1},...(input.rescheduleAt?{scheduledAt:new Date(input.rescheduleAt)}:{})}});
  await this.db.auditLog.create({data:{actorId:actor.id,action:'DELIVERY_ATTEMPT_FAILED',resource:'LOGISTICS',resourceId:id,context:input}});
  return {status:'FAILED_ATTEMPT',retryAvailable:true};
 }
}
