import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Db } from '../core/db';
import { AuthService } from '../auth/auth.service';
import { OrdersService } from '../orders/orders.service';
import { must,parse } from '../core/http';
import { commissionPaise } from '@stitchmate/domain';

@Controller()
export class OperationsController {
 constructor(private readonly db:Db,private readonly auth:AuthService,private readonly orders:OrdersService){}
 @Get('tailor/requests') async requests(@Req() req:Request){const actor=await this.auth.require(req,['tailor_owner','tailor_staff']);return this.db.order.findMany({where:{tailorId:{in:actor.tailorIds},status:{in:['QUOTE_REQUESTED','QUOTE_PENDING','QUOTE_READY']}},include:{items:{include:{category:true}},quotes:{orderBy:{revision:'desc'},take:1}},orderBy:{createdAt:'desc'}});}
 @Get('tailor/orders') async tailored(@Req() req:Request){return this.orders.list(await this.auth.require(req,['tailor_owner','tailor_staff']),'tailor');}
 @Get('tailor/orders/:id') async tailoredOne(@Req() req:Request,@Param('id') id:string){return this.orders.visible(id,await this.auth.require(req,['tailor_owner','tailor_staff']));}
 @Post('tailor/requests/:id/accept') async accept(@Req() req:Request,@Param('id') id:string){return this.orders.tailorAction(await this.auth.require(req,['tailor_owner','tailor_staff']),id,'accept');}
 @Post('tailor/requests/:id/decline') async decline(@Req() req:Request,@Param('id') id:string){return this.orders.tailorAction(await this.auth.require(req,['tailor_owner','tailor_staff']),id,'decline');}
 @Get('tailor/orders/:id/quote-context') async quoteContext(@Req() req:Request,@Param('id') id:string){
  const actor=await this.auth.require(req,['tailor_owner','tailor_staff']);const order=await this.orders.visible(id,actor);
  must(actor.tailorIds.includes(order.tailorId),'Not your order','forbidden');
  const address=await this.db.address.findUniqueOrThrow({where:{id:order.pickupAddressId}});
  const zone=await this.db.serviceZone.findFirst({where:{pincode:address.pincode,active:true}});
  must(zone,'Pickup zone unavailable','conflict');
  return {logisticsPaise:zone.pickupFeePaise+zone.returnFeePaise,currency:'INR'};
 }
 @Post('tailor/orders/:id/quotes') async quote(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){return this.orders.quote(await this.auth.require(req,['tailor_owner','tailor_staff']),id,body);}
 @Post('tailor/orders/:id/receipt') async receipt(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.auth.require(req,['tailor_owner','tailor_staff']);const order=await this.orders.visible(id,actor);
  must(actor.tailorIds.includes(order.tailorId),'Not your order','forbidden');must(order.status==='MATERIAL_RECEIVED','Inbound courier handoff must be completed first','conflict');
  const input=parse(z.object({accepted:z.boolean(),note:z.string().max(1000),proofFileId:z.string().uuid().optional()}),body);
  if(input.proofFileId){const f=await this.db.uploadedFile.findFirst({where:{id:input.proofFileId,ownerId:actor.id,status:'VERIFIED'}});must(f,'Photo evidence not verified','forbidden');}
  if(!input.accepted){must(!!input.proofFileId,'Material discrepancies require photographic evidence');return this.db.$transaction(async tx=>{await this.orders.transition(tx,order,'MATERIAL_ISSUE',actor.id,input.note);const d=await tx.dispute.create({data:{orderId:id,reporterId:actor.id,category:'MATERIAL',description:input.note||'Material mismatch'}});return d;});}
  return this.db.$transaction(async tx=>{await this.orders.transition(tx,order,'IN_PRODUCTION',actor.id,'Tailor verified materials');await tx.orderItem.updateMany({where:{orderId:id},data:{productionStatus:'IN_PROGRESS'}});return {status:'IN_PRODUCTION'};});
 }
 @Post('tailor/orders/:id/progress') async progress(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.auth.require(req,['tailor_owner','tailor_staff']);const order=await this.orders.visible(id,actor);
  must(actor.tailorIds.includes(order.tailorId),'Not your order','forbidden');must(['IN_PRODUCTION','REWORK_IN_PROGRESS'].includes(order.status),'Work cannot be updated yet','conflict');
  const input=parse(z.object({itemId:z.string().uuid(),note:z.string().min(3).max(1000),status:z.enum(['IN_PROGRESS','READY_FOR_QC']),fileId:z.string().uuid().optional()}),body);
  must(order.items.some(i=>i.id===input.itemId),'Garment not found','notfound');
  if(input.status==='READY_FOR_QC')must(input.fileId,'Completed garment photograph is required for quality review');
  if(input.fileId){const f=await this.db.uploadedFile.findFirst({where:{id:input.fileId,ownerId:actor.id,status:'VERIFIED',purpose:input.status==='READY_FOR_QC'?'QC':undefined}});must(f,'Progress photograph not verified','forbidden');}
  return this.db.$transaction(async tx=>{await tx.orderItem.update({where:{id:input.itemId},data:{productionStatus:input.status}});return tx.productionEvent.create({data:{orderItemId:input.itemId,actorId:actor.id,status:input.status,note:input.note,fileId:input.fileId}});});
 }
 @Post('tailor/orders/:id/ready-for-qc') async ready(@Req() req:Request,@Param('id') id:string){
  const actor=await this.auth.require(req,['tailor_owner','tailor_staff']);const order=await this.orders.visible(id,actor);must(actor.tailorIds.includes(order.tailorId),'Not your order','forbidden');
  must(order.items.every(i=>i.productionStatus==='READY_FOR_QC'),'Every garment must be marked ready for quality check','conflict');
  const images=await this.db.productionEvent.findMany({where:{orderItemId:{in:order.items.map(i=>i.id)},status:'READY_FOR_QC',fileId:{not:null}}});
  must(order.items.every(i=>images.some(e=>e.orderItemId===i.id)),'Upload a completed garment photograph for each item before QC','conflict');
  return this.db.$transaction(async tx=>{await this.orders.transition(tx,order,'QUALITY_CHECK',actor.id);return {status:'QUALITY_CHECK'};});
 }
 @Get('admin/orders') async all(@Req() req:Request){return this.orders.list(await this.auth.require(req,['admin','finance']),'admin');}
 @Get('admin/orders/:id/qc-evidence') async qcEvidence(@Req() req:Request,@Param('id') id:string){
  const actor=await this.auth.require(req,['admin']);
  const order=await this.orders.visible(id,actor);
  must(order.status==='QUALITY_CHECK','Order is not awaiting quality review','conflict');
  const events=await this.db.productionEvent.findMany({where:{orderItemId:{in:order.items.map(i=>i.id)},status:'READY_FOR_QC',fileId:{not:null}},orderBy:{createdAt:'desc'}});
  return {orderId:order.id,orderNumber:order.orderNumber,status:order.status,items:order.items.map(i=>({
   id:i.id,garment:i.category.title,quantity:i.quantity,status:i.productionStatus,
   evidence:events.filter(e=>e.orderItemId===i.id).map(e=>({fileId:e.fileId,note:e.note,createdAt:e.createdAt}))
  }))};
 }

 @Post('admin/orders/:id/approve-qc') async qc(@Req() req:Request,@Param('id') id:string){
  const actor=await this.auth.require(req,['admin']);const order=await this.orders.visible(id,actor);
  must(order.status==='QUALITY_CHECK','Order is not ready for QC','conflict');
  const proofs=await this.db.productionEvent.findMany({where:{orderItemId:{in:order.items.map(i=>i.id)},status:'READY_FOR_QC',fileId:{not:null}}});
  must(order.items.every(i=>i.productionStatus==='READY_FOR_QC'&&proofs.some(p=>p.orderItemId===i.id)),
   'Verified QC evidence required for every garment','conflict');
  return this.db.$transaction(async tx=>{
   await this.orders.transition(tx,order,'RETURN_PICKUP_SCHEDULED',actor.id,'QC passed');
   await tx.orderItem.updateMany({where:{orderId:id},data:{productionStatus:'APPROVED'}});
   const direction=order.logistics.some(j=>j.direction==='OUTBOUND')?'REWORK_OUTBOUND':'OUTBOUND';
   await tx.logisticsJob.create({data:{orderId:id,direction,packageId:`PKG-${randomUUID().slice(0,12).toUpperCase()}`,status:'UNASSIGNED'}});
   await tx.auditLog.create({data:{actorId:actor.id,action:'QC_APPROVED',resource:'ORDER',resourceId:id}});
   return {status:'RETURN_PICKUP_SCHEDULED'};
  });
 }
 @Get('admin/disputes') async disputes(@Req() req:Request){await this.auth.require(req,['admin']);return this.db.dispute.findMany({include:{order:{select:{orderNumber:true,status:true}}},orderBy:{createdAt:'desc'},take:100});}
 @Post('admin/disputes/:id/resolve') async resolve(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.auth.require(req,['admin']);const input=parse(z.object({decision:z.enum(['REJECT','APPROVE_REWORK','REFUND_REVIEW']),note:z.string().min(10).max(2000)}),body);
  const dispute=await this.db.dispute.findUnique({where:{id},include:{order:true}});must(dispute?.status==='OPEN','Claim not open','notfound');
  return this.db.$transaction(async tx=>{
   if(input.decision==='REFUND_REVIEW'){
    await tx.dispute.update({where:{id},data:{status:'REFUND_REVIEW',decision:input.note}});
    await tx.auditLog.create({data:{actorId:actor.id,action:'REFUND_ESCALATED',resource:'DISPUTE',resourceId:id,context:input}});
    return {status:'REFUND_REVIEW',requiresManualRefundReview:true};
   }
   const next=input.decision==='APPROVE_REWORK'?'REWORK_APPROVED':'COMPLETED';
   if(dispute.order.status==='DISPUTED') await this.orders.transition(tx,dispute.order,next,actor.id,input.note);
   await tx.dispute.update({where:{id},data:{status:'RESOLVED',decision:`${input.decision}: ${input.note}`,resolvedAt:new Date()}});
   if(input.decision==='APPROVE_REWORK')await tx.logisticsJob.create({data:{orderId:dispute.orderId,direction:'REWORK_INBOUND',packageId:`PKG-${randomUUID().slice(0,12).toUpperCase()}`,status:'UNASSIGNED'}});
   await tx.auditLog.create({data:{actorId:actor.id,action:'DISPUTE_RESOLVED',resource:'DISPUTE',resourceId:id,context:input}});return {status:'RESOLVED',decision:input.decision};
  });
 }
 @Post('admin/orders/:id/resolve-material-issue') async resolveMaterial(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.auth.require(req,['admin']);const order=await this.orders.visible(id,actor);
  must(order.status==='MATERIAL_ISSUE','Order has no unresolved material issue','conflict');
  const input=parse(z.object({decision:z.enum(['RESUME_AFTER_RESOLUTION','ESCALATE_REFUND']),note:z.string().min(15).max(1500)}),body);
  return this.db.$transaction(async tx=>{
   if(input.decision==='RESUME_AFTER_RESOLUTION'){
    await this.orders.transition(tx,order,'MATERIAL_RECEIVED',actor.id,input.note);
    await tx.dispute.updateMany({where:{orderId:id,category:'MATERIAL',status:'OPEN'},data:{status:'RESOLVED',decision:`Resolved material exception: ${input.note}`,resolvedAt:new Date()}});
   }
   await tx.auditLog.create({data:{actorId:actor.id,action:'MATERIAL_ISSUE_REVIEWED',resource:'ORDER',resourceId:id,context:input}});
   return {status:input.decision==='ESCALATE_REFUND'?'MATERIAL_ISSUE':'MATERIAL_RECEIVED',decision:input.decision};
  });
 }
 @Get('admin/refunds') async refundList(@Req() req:Request){await this.auth.require(req,['admin','finance']);return this.db.refund.findMany({include:{order:{select:{orderNumber:true,status:true,paymentStatus:true}}},orderBy:{createdAt:'desc'},take:100});}
 @Post('admin/refunds') async refundRequest(@Req() req:Request,@Body() body:unknown){
  const actor=await this.auth.require(req,['admin','finance']);const input=parse(z.object({orderId:z.string().uuid(),amountPaise:z.string().regex(/^[1-9]\d{0,12}$/),reason:z.string().min(10).max(1500),idempotencyKey:z.string().min(12).max(120)}),body);
  const found=await this.db.refund.findUnique({where:{idempotencyKey:input.idempotencyKey}});
  if(found){must(found.orderId===input.orderId,'Idempotency key collision','conflict');return found;}
  const order=await this.db.order.findUnique({where:{id:input.orderId},include:{quotes:true,refunds:true}});
  must(order&&['PAID','PARTIALLY_REFUNDED'].includes(order.paymentStatus),'Only verified paid orders can be refunded','conflict');
  const quote=order.quotes.find(q=>q.id===order.acceptedQuoteId);must(quote,'Paid quote not found','conflict');
  const amount=BigInt(input.amountPaise);
  const already=order.refunds.filter(r=>['REQUESTED','APPROVED','COMPLETED'].includes(r.status)).reduce((a,r)=>a+r.amountPaise,0n);
  must(amount+already<=quote.totalPaise,'Refund exceeds verified payment amount','conflict');
  const refund=await this.db.refund.create({data:{orderId:input.orderId,amountPaise:amount,reason:input.reason,idempotencyKey:input.idempotencyKey}});
  await this.db.auditLog.create({data:{actorId:actor.id,action:'REFUND_REQUESTED',resource:'REFUND',resourceId:refund.id,context:{orderId:input.orderId,amountPaise:input.amountPaise}}});
  return refund;
 }
 @Post('admin/refunds/:id/approve') async approveRefund(@Req() req:Request,@Param('id') id:string){
  const actor=await this.auth.require(req,['admin','finance']);return this.db.$transaction(async tx=>{
   const changed=await tx.refund.updateMany({where:{id,status:'REQUESTED'},data:{status:'APPROVED',approvedBy:actor.id}});
   must(changed.count===1,'Refund not found or already processed','conflict');
   await tx.auditLog.create({data:{actorId:actor.id,action:'REFUND_APPROVED',resource:'REFUND',resourceId:id}});return {status:'APPROVED',requiresExternalProviderAction:true};
  });
 }
 @Post('admin/refunds/:id/record-completion') async recordRefund(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.auth.require(req,['admin','finance']);const input=parse(z.object({providerRefundId:z.string().min(6).max(120)}),body);
  return this.db.$transaction(async tx=>{
   const refund=await tx.refund.findUnique({where:{id},include:{order:{include:{quotes:true,refunds:true}}}});
   must(refund?.status==='APPROVED','Refund must be approved before recording confirmed provider completion','conflict');
   const paid=refund.order.quotes.find(q=>q.id===refund.order.acceptedQuoteId);must(paid,'Paid quote unavailable','conflict');
   const spent=refund.order.refunds.filter(r=>r.status==='COMPLETED').reduce((n,r)=>n+r.amountPaise,0n);
   const updated=await tx.refund.updateMany({where:{id,status:'APPROVED'},data:{status:'COMPLETED',providerRefundId:input.providerRefundId}});
   must(updated.count===1,'Refund recorded already','conflict');
   await tx.order.update({where:{id:refund.orderId},data:{paymentStatus:spent+refund.amountPaise>=paid.totalPaise?'REFUNDED':'PARTIALLY_REFUNDED'}});
   await tx.auditLog.create({data:{actorId:actor.id,action:'REFUND_EXTERNAL_CONFIRMATION_RECORDED',resource:'REFUND',resourceId:id,context:input}});
   return {status:'COMPLETED',note:'External provider confirmation was entered by finance; no bank transfer initiated by StitchMate'};
  });
 }
 @Post('admin/disputes/:id/finalize-refund') async finalizeRefund(@Req() req:Request,@Param('id') id:string){
  const actor=await this.auth.require(req,['admin','finance']);
  const d=await this.db.dispute.findUnique({where:{id},include:{order:{include:{refunds:true}}}});
  must(d?.status==='REFUND_REVIEW'&&d.order.status==='DISPUTED','Claim not in refund review','conflict');
  must(d.order.refunds.some(r=>r.status==='COMPLETED'),'No externally confirmed refund recorded','conflict');
  return this.db.$transaction(async tx=>{
   await this.orders.transition(tx,d.order,'COMPLETED',actor.id,'External refund reviewed and recorded');
   await tx.dispute.update({where:{id},data:{status:'RESOLVED',resolvedAt:new Date(),decision:'REFUND_COMPLETED'}});
   await tx.auditLog.create({data:{actorId:actor.id,action:'REFUND_DISPUTE_CLOSED',resource:'DISPUTE',resourceId:id}});
   return {status:'RESOLVED'};
  });
 }
 @Get('tailor/earnings') async earnings(@Req() req:Request){const actor=await this.auth.require(req,['tailor_owner','tailor_staff']);return this.db.tailorPayout.findMany({where:{tailorId:{in:actor.tailorIds}},orderBy:{createdAt:'desc'}});}
 @Get('admin/finance') async finance(@Req() req:Request){
  await this.auth.require(req,['admin','finance']);
  const payouts=await this.db.tailorPayout.findMany({include:{order:{select:{orderNumber:true,status:true}},tailor:{select:{shopName:true}}},orderBy:{createdAt:'desc'},take:100});
  const payments=await this.db.paymentOrder.findMany({include:{order:{select:{orderNumber:true}},transactions:true},orderBy:{createdAt:'desc'},take:100});
  return {payouts,payments};
 }
 @Post('admin/payouts/:orderId/prepare') async prepare(@Req() req:Request,@Param('orderId') id:string){
  const actor=await this.auth.require(req,['finance','admin']);const order=await this.orders.visible(id,actor);
  must(order.status==='COMPLETED' && order.paymentStatus==='PAID','Only completed and paid orders can be paid out','conflict');
  must(!order.disputes.some(d=>d.status==='OPEN'),'Open dispute holds payout','conflict');
  const delivered=order.events.filter(e=>e.to==='DELIVERED').at(-1);
  must(delivered && Date.now()-delivered.createdAt.getTime()>Number(process.env.FIT_CLAIM_WINDOW_HOURS??48)*3600_000,'Wait until fitting claim window closes','conflict');
  const quote=order.quotes.find(q=>q.id===order.acceptedQuoteId);must(quote,'Accepted quote missing','conflict');
  const commission=commissionPaise(quote.subtotalPaise,Number(process.env.PLATFORM_COMMISSION_BPS??'1500'));
  const existing=await this.db.tailorPayout.findUnique({where:{orderId:id}});if(existing)return existing;
  return this.db.tailorPayout.create({data:{orderId:id,tailorId:order.tailorId,grossPaise:quote.subtotalPaise,commissionPaise:commission,netPaise:quote.subtotalPaise-commission}});
 }
 @Post('admin/payouts/:id/approve') async approve(@Req() req:Request,@Param('id') id:string){
  const actor=await this.auth.require(req,['finance','admin']);return this.db.$transaction(async tx=>{
   const pay=await tx.tailorPayout.findUnique({where:{id},include:{order:{include:{disputes:true}}}});
   must(pay?.status==='PENDING_APPROVAL' && pay.order.status==='COMPLETED' && pay.order.paymentStatus==='PAID' && !pay.order.disputes.some(d=>d.status==='OPEN'),'Payout cannot be approved','conflict');
   const result=await tx.tailorPayout.updateMany({where:{id,status:'PENDING_APPROVAL'},data:{status:'APPROVED',approvedBy:actor.id}});
   must(result.count===1,'Payout already handled','conflict');
   await tx.auditLog.create({data:{actorId:actor.id,action:'PAYOUT_APPROVED',resource:'PAYOUT',resourceId:id}});return {status:'APPROVED'};
  });
 }
 @Post('admin/payouts/:id/mark-paid') async markPaid(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.auth.require(req,['finance','admin']);const input=parse(z.object({reference:z.string().min(6).max(120)}),body);
  return this.db.$transaction(async tx=>{const updated=await tx.tailorPayout.updateMany({where:{id,status:'APPROVED'},data:{status:'PAID',paidAt:new Date(),providerReference:input.reference}});must(updated.count===1,'Payout not approved or already paid','conflict');await tx.auditLog.create({data:{actorId:actor.id,action:'PAYOUT_MARKED_PAID',resource:'PAYOUT',resourceId:id,context:{reference:input.reference}}});return {status:'PAID'};});
 }
 @Get('admin/audit-logs') async audit(@Req() req:Request){await this.auth.require(req,['admin']);return this.db.auditLog.findMany({orderBy:{createdAt:'desc'},take:100});}
}
