import { Injectable, ForbiddenException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Db } from '../core/db';
import type { Actor } from '../auth/auth.service';
import { must, orderNumber, parse } from '../core/http';
import { createOrderSchema, createQuoteSchema } from '@stitchmate/contracts';
import { assertTransition, calculateQuote, isQuoteAcceptable, parsePaise, requiredMaterialReady } from '@stitchmate/domain';

const uuid=z.string().uuid();
export const correctionSchema=z.object({category:z.enum(['FIT','DAMAGE','LOSS','OTHER']),description:z.string().min(15).max(2000)});
type Tx=Prisma.TransactionClient;
@Injectable()
export class OrdersService {
 constructor(private readonly db:Db){}
 async visible(id:string,actor:Actor){
  const order=await this.db.order.findUnique({where:{id:parse(uuid,id)},include:{items:{include:{category:true}},tailor:{select:{id:true,shopName:true,ownerId:true}},quotes:{include:{lines:true},orderBy:{revision:'desc'}},logistics:{include:{handoffs:true},orderBy:{createdAt:'asc'}},events:{orderBy:{createdAt:'asc'}},payments:true,disputes:true,payout:true,pickupAddress:true,returnAddress:true,review:true}});
  must(order,'Order not found','notfound');
  must(order.customerId===actor.id || actor.tailorIds.includes(order.tailorId) || actor.roles.includes('admin') || actor.roles.includes('finance'),'Order not found','notfound');
  if(order.customerId===actor.id) return {...order,payout:null,payments:[]};
  if(!actor.roles.includes('admin') && !actor.roles.includes('finance')){
   // Restrict financial details and customer PII for pre-payment tailor requests.
   if(order.paymentStatus!=='PAID') return {...order,pickupAddress:null,returnAddress:null,payments:[]};
   return {...order,payments:[]};
  }
  return order;
 }
 async list(actor:Actor,scope:'customer'|'tailor'|'admin'='customer'){
  if(scope==='admin') must(actor.roles.includes('admin') || actor.roles.includes('finance'),'Admin role required','forbidden');
  const where=scope==='admin'?{}:scope==='tailor'?{tailorId:{in:actor.tailorIds}}:{customerId:actor.id};
  return this.db.order.findMany({where,include:{tailor:{select:{shopName:true,slug:true}},items:{include:{category:true}},quotes:{orderBy:{revision:'desc'},take:1},logistics:{select:{id:true,direction:true,status:true}},disputes:{select:{id:true,status:true}}},orderBy:{createdAt:'desc'},take:100});
 }
 async transition(tx:Tx,order:{id:string;status:string;version:number},to:string,actorId:string|null,reason?:string){
  try{assertTransition(order.status,to);}catch{throw new ConflictException(`Order cannot move from ${order.status} to ${to}`);}
  const updated=await tx.order.updateMany({where:{id:order.id,status:order.status,version:order.version},data:{status:to,version:{increment:1}}});
  must(updated.count===1,'Order changed. Refresh and retry.','conflict');
  await tx.orderStatusEvent.create({data:{orderId:order.id,from:order.status,to,actorId,reason}});
  if (['PICKUP_SCHEDULED','MATERIAL_RECEIVED','IN_PRODUCTION','RETURN_PICKUP_SCHEDULED','DELIVERED'].includes(to)) {
   await tx.outboxEvent.create({data:{topic:'order.status_changed',payload:{orderId:order.id,status:to}}});
  }
 }
 async create(actor:Actor,body:unknown){
  const data=parse(createOrderSchema,body);
  const [tailor,pickup,returnAddress]=await Promise.all([
   this.db.tailor.findUnique({where:{id:data.tailorId},include:{services:true,zones:true}}),
   this.db.address.findFirst({where:{id:data.pickupAddressId,userId:actor.id}}),
   this.db.address.findFirst({where:{id:data.returnAddressId,userId:actor.id}})
  ]);
  must(tailor?.status==='APPROVED','Tailor is unavailable','notfound');
  must(pickup&&returnAddress,'Pickup and return addresses must belong to you');
  const zone=await this.db.serviceZone.findFirst({where:{pincode:pickup.pincode,active:true}});
  const returnZone=await this.db.serviceZone.findFirst({where:{pincode:returnAddress.pincode,active:true}});
  must(zone&&returnZone&&tailor.zones.some(z=>z.pincode===pickup.pincode&&z.active),'The address or tailor is outside the service area');
  must((await this.db.order.count({where:{tailorId:tailor.id,status:{notIn:['CANCELLED','COMPLETED','TAILOR_DECLINED']}}}))<tailor.maxOpenOrders,'Tailor is at capacity','conflict');
  const categoryIds=[...new Set(data.items.map(i=>i.categoryId))];
  const categories=await this.db.serviceCategory.findMany({where:{id:{in:categoryIds},active:true,serviceType:data.serviceType}});
  must(categories.length===categoryIds.length,'An item category does not match your service type');
  must(categoryIds.every(id=>tailor.services.some(s=>s.categoryId===id&&s.active)),'Tailor does not offer a selected service');
  const measurementIds=[...new Set(data.items.map(i=>i.measurementVersionId).filter((x):x is string=>!!x))];
  const versions=await this.db.measurementVersion.findMany({where:{id:{in:measurementIds},profile:{userId:actor.id}}});
  must(versions.length===measurementIds.length,'One or more measurement profiles are unavailable');
  const allFileIds=[...new Set(data.items.flatMap(i=>i.fileIds??[]))];
  const files=await this.db.uploadedFile.findMany({where:{id:{in:allFileIds},ownerId:actor.id,status:'VERIFIED'}});
  must(files.length===allFileIds.length,'All reference photos must be uploaded and verified');
  const valid=data.items.every(i=>{
   const associated=files.filter(f=>(i.fileIds??[]).includes(f.id));
   return requiredMaterialReady(data.serviceType,{hasMeasurement:!!i.measurementVersionId,hasSample:i.hasFittingSample??false,hasReference:!!i.instructions?.trim()||associated.some(f=>f.purpose==='DESIGN'),hasBeforePhoto:associated.some(f=>f.purpose==='BEFORE'),hasInstructions:!!i.instructions?.trim()});
  });
  must(valid,data.serviceType==='CUSTOM_STITCHING'?'Provide a style description/reference and measurements or a sample garment':'Provide before photos and specific alteration instructions');
  return this.db.order.create({data:{orderNumber:orderNumber(),customerId:actor.id,tailorId:tailor.id,pickupAddressId:pickup.id,returnAddressId:returnAddress.id,serviceType:data.serviceType,items:{create:data.items.map(i=>({categoryId:i.categoryId,quantity:i.quantity,design:(i.design??{}) as Prisma.InputJsonValue,material:(i.material??{}) as Prisma.InputJsonValue,instructions:i.instructions,measurementVersionId:i.measurementVersionId??null,hasFittingSample:i.hasFittingSample??false,fileIds:(i.fileIds??[]) as Prisma.InputJsonValue}))}},include:{items:true}});
 }
 async requestQuote(actor:Actor,id:string){
  const order=await this.visible(id,actor);must(order.customerId===actor.id,'Only the customer can request a quotation','forbidden');
  return this.db.$transaction(async tx=>{await this.transition(tx,order,'QUOTE_REQUESTED',actor.id);return {success:true,status:'QUOTE_REQUESTED'};});
 }
 async tailorAction(actor:Actor,id:string,action:'accept'|'decline'){
  const order=await this.visible(id,actor);must(actor.tailorIds.includes(order.tailorId),'Only the assigned tailor can respond','forbidden');
  must(order.tailor.ownerId===actor.id||actor.tailorIds.includes(order.tailorId),'Not your tailor','forbidden');
  return this.db.$transaction(async tx=>{await this.transition(tx,order,action==='accept'?'QUOTE_PENDING':'TAILOR_DECLINED',actor.id);return {status:action==='accept'?'QUOTE_PENDING':'TAILOR_DECLINED'};});
 }
 async quote(actor:Actor,id:string,body:unknown){
  const order=await this.visible(id,actor);must(actor.tailorIds.includes(order.tailorId),'Not your order','forbidden');
  must(['QUOTE_PENDING','QUOTE_READY'].includes(order.status),'Request must be pending pricing','conflict');
  const input=parse(createQuoteSchema,body);const itemIds=new Set(order.items.map(i=>i.id));
  must(input.lines.every(l=>itemIds.has(l.orderItemId)),'Quote lines must refer to order garments');
  must(order.items.every(i=>input.lines.some(l=>l.orderItemId===i.id)),'Every order item requires pricing');
  const prices=calculateQuote(input.lines.map(l=>({unitPricePaise:parsePaise(l.unitPricePaise),quantity:l.quantity})),parsePaise(input.logisticsPaise),parsePaise(input.taxPaise??'0'),parsePaise(input.discountPaise??'0'));
  const pickupAddress=await this.db.address.findUniqueOrThrow({where:{id:order.pickupAddressId}});
  const zone=await this.db.serviceZone.findFirst({where:{pincode:pickupAddress.pincode,active:true}});
  must(zone,'Pickup zone is not active','conflict');
  must(prices.logisticsPaise===zone.pickupFeePaise+zone.returnFeePaise,'Logistics charge differs from zone pricing');
  return this.db.$transaction(async tx=>{
   const lock=await tx.order.updateMany({where:{id:order.id,status:order.status,version:order.version},data:{version:{increment:1}}});
   must(lock.count===1,'Order changed. Refresh and retry.','conflict');
   const latest=await tx.quote.findFirst({where:{orderId:order.id},orderBy:{revision:'desc'}});
   if(latest)await tx.quote.update({where:{id:latest.id},data:{status:'SUPERSEDED'}});
   const quote=await tx.quote.create({data:{orderId:order.id,revision:(latest?.revision??0)+1,...prices,notes:input.notes,validUntil:new Date(Date.now()+(input.validHours??48)*3600_000),lines:{create:input.lines.map(l=>({...l,unitPricePaise:parsePaise(l.unitPricePaise),totalPaise:parsePaise(l.unitPricePaise)*BigInt(l.quantity)}))}},include:{lines:true}});
   if(order.status==='QUOTE_PENDING')await tx.orderStatusEvent.create({data:{orderId:id,from:'QUOTE_PENDING',to:'QUOTE_READY',actorId:actor.id}});
   await tx.order.update({where:{id},data:{status:'QUOTE_READY'}});
   await tx.outboxEvent.create({data:{topic:'order.quote_ready',payload:{orderId:id,quoteId:quote.id}}});
   return quote;
  });
 }
 async acceptQuote(actor:Actor,id:string,quoteId:string){
  const order=await this.visible(id,actor);must(order.customerId===actor.id,'Not your order','forbidden');
  must(order.status==='QUOTE_READY','Order is not awaiting a quotation acceptance','conflict');
  const latest=order.quotes[0];must(latest&&isQuoteAcceptable(latest,parse(uuid,quoteId)),'Quote expired or superseded','conflict');
  return this.db.$transaction(async tx=>{
   await this.transition(tx,order,'QUOTE_ACCEPTED',actor.id);
   await tx.quote.update({where:{id:latest.id},data:{status:'ACCEPTED'}});
   await tx.order.update({where:{id},data:{acceptedQuoteId:latest.id}});
   for(const item of order.items){if(item.measurementVersionId){const version=await tx.measurementVersion.findUniqueOrThrow({where:{id:item.measurementVersionId}});await tx.orderItem.update({where:{id:item.id},data:{measurementSnapshot:{values:version.values,unit:version.unit,version:version.version} as Prisma.InputJsonValue}});}}
   return {status:'QUOTE_ACCEPTED',quoteId:latest.id};
  });
 }
 async cancel(actor:Actor,id:string){
  const order=await this.visible(id,actor);must(order.customerId===actor.id,'Not your order','forbidden');
  must(['DRAFT','QUOTE_REQUESTED','QUOTE_PENDING','QUOTE_READY','QUOTE_ACCEPTED'].includes(order.status),'After payment, contact support for cancellation and refund review','conflict');
  return this.db.$transaction(async tx=>{await this.transition(tx,order,'CANCELLED',actor.id);return {status:'CANCELLED'};});
 }
 async timeline(actor:Actor,id:string){const order=await this.visible(id,actor);return {orderNumber:order.orderNumber,status:order.status,paymentStatus:order.paymentStatus,events:order.events,logistics:order.logistics};}
 async confirmDelivery(actor:Actor,id:string){
  const order=await this.visible(id,actor);must(order.customerId===actor.id,'Not your order','forbidden');
  must(order.status==='DELIVERED','Return delivery has not been confirmed','conflict');
  must(order.logistics.some(j=>j.direction==='OUTBOUND' && j.status==='DELIVERED'),'No confirmed return handoff','conflict');
  return this.db.$transaction(async tx=>{await this.transition(tx,order,'COMPLETED',actor.id);await tx.outboxEvent.create({data:{topic:'order.completed',payload:{orderId:id}}});return {status:'COMPLETED'};});
 }
 async correction(actor:Actor,id:string,body:unknown){
  const order=await this.visible(id,actor);must(order.customerId===actor.id,'Not your order','forbidden');
  const input=parse(correctionSchema,body);must(['DELIVERED','COMPLETED'].includes(order.status),'Fitting claims are available after delivery','conflict');
  const delivered=order.events.filter(e=>e.to==='DELIVERED').at(-1);must(delivered && Date.now()-delivered.createdAt.getTime()<=Number(process.env.FIT_CLAIM_WINDOW_HOURS??48)*3600_000,'Correction request window has ended','conflict');
  must(!order.disputes.some(d=>['FIT','DAMAGE','LOSS'].includes(d.category)),'A fitting or damage claim has already been submitted','conflict');
  return this.db.$transaction(async tx=>{const d=await tx.dispute.create({data:{orderId:id,reporterId:actor.id,...input}});await this.transition(tx,order,'DISPUTED',actor.id,'Fitting or damage claim');return d;});
 }
 async review(actor:Actor,id:string,body:unknown){
  const order=await this.visible(id,actor);must(order.customerId===actor.id,'Not your order','forbidden');must(['DELIVERED','COMPLETED'].includes(order.status),'Reviews are available after delivery','conflict');
  must(!order.review,'You have already reviewed this order','conflict');
  const input=parse(z.object({score:z.number().int().min(1).max(5),text:z.string().max(1000).optional()}),body);
  return this.db.review.create({data:{orderId:id,...input}});
 }
}
