import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { verifyWebhookHmac } from '../core/security';
import { Prisma } from '@prisma/client';
import { Db } from '../core/db';
import { AuthService } from '../auth/auth.service';
import { OrdersService } from '../orders/orders.service';
import { must } from '../core/http';
import { mockPaymentsAllowed, isProd } from '../core/config';

/** Calls only the fixed Razorpay HTTPS host. Credentials never enter a URL or log. */
async function createRazorpayOrder(amountPaise:bigint,receipt:string,orderId:string):Promise<string>{
 const keyId=process.env.RAZORPAY_KEY_ID!;
 const keySecret=process.env.RAZORPAY_KEY_SECRET!;
 const body=JSON.stringify({amount:Number(amountPaise),currency:'INR',receipt,notes:{stitchmate_order_id:orderId}});
 return new Promise<string>((resolve,reject)=>{
  const req=httpsRequest('https://api.razorpay.com/v1/orders',{
   method:'POST',family:4,timeout:15000,headers:{
    'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),
    'Authorization':'Basic '+Buffer.from(`${keyId}:${keySecret}`).toString('base64')
   }
  },res=>{
   let raw='';
   res.setEncoding('utf8');
   res.on('data',(chunk:string)=>{
    raw+=chunk;
    if(raw.length>100_000)req.destroy(new Error('RAZORPAY_RESPONSE_TOO_LARGE'));
   });
   res.on('end',()=>{
    if((res.statusCode??500)<200||(res.statusCode??500)>=300){
     reject(new Error(`Razorpay order creation failed (HTTP ${res.statusCode??'unknown'}). Verify test credentials and merchant access.`));return;
    }
    try{
     const result=JSON.parse(raw) as {id?:unknown};
     if(typeof result.id!=='string'||!result.id.startsWith('order_'))throw new Error('Invalid Razorpay order ID');
     resolve(result.id);
    }catch{reject(new Error('Razorpay returned an invalid order response'));}
   });
  });
  req.on('timeout',()=>req.destroy(new Error('RAZORPAY_CONNECTION_TIMEOUT')));
  req.on('error',e=>reject(new Error(`Razorpay HTTPS request failed (${e.message==='RAZORPAY_CONNECTION_TIMEOUT'?'timeout':'network error'}).`)));
  req.end(body);
 });
}

@Controller()
export class PaymentsController {
 constructor(private readonly db:Db,private readonly auth:AuthService,private readonly orders:OrdersService){}
 @Get('payments/mode') mode(){
  if(mockPaymentsAllowed())return {mode:'demo',checkoutAvailable:true,simulationConfirmAvailable:process.env.ENABLE_DEMO_PAYMENT_CONFIRM==='true'};
  const id=process.env.RAZORPAY_KEY_ID??'', secret=process.env.RAZORPAY_KEY_SECRET??'';
  if(!id||!secret)return {mode:'unconfigured',checkoutAvailable:false};
  if(!isProd&&!id.startsWith('rzp_test_'))return {mode:'live_keys_blocked',checkoutAvailable:false};
  if(!/^rzp_(test|live)_[a-zA-Z0-9]+$/.test(id))return {mode:'invalid_key_id',checkoutAvailable:false};
  return {mode:id.startsWith('rzp_test_')?'razorpay_test':'razorpay_live',checkoutAvailable:true};
 }

 @Post('orders/:id/checkout') async checkout(@Req() req:Request,@Param('id') id:string,@Headers('idempotency-key') key?:string){
  const actor=await this.auth.require(req);const order=await this.orders.visible(id,actor);
  must(order.customerId===actor.id,'Only the customer can initiate payment','forbidden');
  must(['QUOTE_ACCEPTED','PAYMENT_PENDING','PAYMENT_FAILED'].includes(order.status),'Accept a valid quotation before paying','conflict');
  const quote=order.quotes.find(q=>q.id===order.acceptedQuoteId);
  must(quote?.status==='ACCEPTED','Accepted quotation not found','conflict');
  const zone=await this.db.serviceZone.findFirst({where:{pincode:order.pickupAddress!.pincode,active:true}});
  must(zone,'Your service zone is currently unavailable','conflict');
  must(quote.logisticsPaise===zone.pickupFeePaise+zone.returnFeePaise,'Delivery pricing changed; contact support','conflict');
  must(key && /^[a-zA-Z0-9_:\-]{12,100}$/.test(key),'A stable Idempotency-Key header is required');
  const expectedProvider=mockPaymentsAllowed()?'DEV_MOCK':'RAZORPAY';
  const existing=await this.db.paymentOrder.findUnique({where:{idempotencyKey:key}});
  if(existing){must(existing.orderId===id,'Idempotency key used for a different order','conflict');must(existing.provider===expectedProvider,'Payment mode changed. Refresh checkout before retrying','conflict');return {provider:existing.provider,providerOrderId:existing.providerOrderId,amountPaise:existing.amountPaise,currency:'INR',keyId:process.env.RAZORPAY_KEY_ID,simulated:existing.provider==='DEV_MOCK'};}
  const retry=await this.db.paymentOrder.findFirst({where:{orderId:id,status:'PENDING',provider:expectedProvider},orderBy:{createdAt:'desc'}});
  if(retry)return {provider:retry.provider,providerOrderId:retry.providerOrderId,amountPaise:retry.amountPaise,currency:'INR',keyId:process.env.RAZORPAY_KEY_ID,simulated:retry.provider==='DEV_MOCK'};
  let providerOrderId:string,provider:string;
  if(mockPaymentsAllowed()){provider='DEV_MOCK';providerOrderId=`dev_order_${randomUUID()}`;}
  else{
   must(!!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET,'Razorpay test credentials are missing','conflict');
   must(isProd || process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_'),'Use Razorpay test keys for local development; live keys are blocked','conflict');
   must(/^rzp_(test|live)_[a-zA-Z0-9]+$/.test(process.env.RAZORPAY_KEY_ID!),'Invalid Razorpay Key ID format','conflict');
   must(quote.totalPaise>0n && quote.totalPaise<=BigInt(Number.MAX_SAFE_INTEGER),'Payment amount out of gateway range','conflict');
   try{providerOrderId=await createRazorpayOrder(quote.totalPaise,order.orderNumber,id);}
   catch(e){must(false,(e as Error).message,'conflict');throw e;}
   provider='RAZORPAY';
  }
  await this.db.$transaction(async tx=>{
   if(order.status==='QUOTE_ACCEPTED'||order.status==='PAYMENT_FAILED')await this.orders.transition(tx,order,'PAYMENT_PENDING',actor.id);
   await tx.paymentOrder.create({data:{orderId:id,provider,providerOrderId,amountPaise:quote.totalPaise,idempotencyKey:key!}});
  });
  return {provider,providerOrderId,amountPaise:quote.totalPaise,currency:'INR',keyId:process.env.RAZORPAY_KEY_ID,simulated:provider==='DEV_MOCK'};
 }
 private async markPaid(providerOrderId:string,paymentId:string,amount:bigint){
  return this.db.$transaction(async tx=>{
   const pay=await tx.paymentOrder.findUnique({where:{providerOrderId},include:{order:true}});
   must(pay,'Unrecognized provider order','notfound');must(pay.amountPaise===amount,'Captured amount mismatch','conflict');
   if(pay.status==='PAID')return {alreadyProcessed:true};
   must(pay.status==='PENDING' && pay.order.status==='PAYMENT_PENDING','Order is not awaiting payment','conflict');
   const updated=await tx.paymentOrder.updateMany({where:{id:pay.id,status:'PENDING'},data:{status:'PAID'}});
   must(updated.count===1,'Payment was already processed','conflict');
   await tx.paymentTransaction.create({data:{paymentOrderId:pay.id,providerPaymentId:paymentId,status:'CAPTURED',amountPaise:amount}});
   await tx.order.update({where:{id:pay.orderId},data:{paymentStatus:'PAID'}});
   await this.orders.transition(tx,pay.order,'PAID',null,'Verified payment capture');
   await tx.outboxEvent.create({data:{topic:'payment.captured',payload:{orderId:pay.orderId,paymentId}}});
   return {paid:true};
  });
 }
 @Post('webhooks/razorpay') async webhook(@Req() req:Request,@Headers('x-razorpay-signature') signature?:string,@Headers('x-razorpay-event-id') eventId?:string,@Body() body?:unknown){
  const rawBody=(req as Request & {rawBody?:Buffer}).rawBody;
  const secret=process.env.RAZORPAY_WEBHOOK_SECRET;must(secret && signature && rawBody,'Missing webhook signature','forbidden');
  must(verifyWebhookHmac(secret,rawBody,signature),'Invalid webhook signature','forbidden');
  must(body && typeof body==='object','Invalid webhook JSON');
  const payload=body as {event?:string;payload?:{payment?:{entity?:{id?:string;order_id?:string;amount?:number;status?:string}}};};
  const id=eventId;must(id && id.length<=128,'Missing x-razorpay-event-id header');
  const previous=await this.db.webhookEvent.findFirst({where:{provider:'RAZORPAY',eventId:id}});
  if(previous?.processed)return {ok:true,duplicate:true};
  await this.db.webhookEvent.upsert({where:{provider_eventId:{provider:'RAZORPAY',eventId:id}},create:{provider:'RAZORPAY',eventId:id,eventType:payload.event??'unknown',hash:createHash('sha256').update(rawBody).digest('hex')},update:{}});
  if(payload.event==='payment.failed'){
   const p=payload.payload?.payment?.entity;
   if(p?.order_id){await this.db.$transaction(async tx=>{const pay=await tx.paymentOrder.findUnique({where:{providerOrderId:p.order_id},include:{order:true}});if(pay?.status==='PENDING'&&pay.order.status==='PAYMENT_PENDING'){await tx.paymentOrder.update({where:{id:pay.id},data:{status:'FAILED'}});await tx.order.update({where:{id:pay.orderId},data:{paymentStatus:'FAILED'}});await this.orders.transition(tx,pay.order,'PAYMENT_FAILED',null,'Verified failed payment');}});}
  }
  if(payload.event==='payment.captured'){
   const p=payload.payload?.payment?.entity;
   const capturedAmount=p?.amount;
   must(p?.id && p.order_id && p.status==='captured' && typeof capturedAmount==='number' && Number.isSafeInteger(capturedAmount) && capturedAmount>0,'Invalid captured payment');
   await this.markPaid(p.order_id,p.id,BigInt(capturedAmount));
  }
  await this.db.webhookEvent.update({where:{provider_eventId:{provider:'RAZORPAY',eventId:id}},data:{processed:true}});
  return {ok:true};
 }
 @Post('dev/payments/:orderId/confirm') async devConfirm(@Req() req:Request,@Param('orderId') id:string){
  must(mockPaymentsAllowed() && process.env.ENABLE_DEMO_PAYMENT_CONFIRM==='true','Simulation endpoint is disabled','notfound');
  const actor=await this.auth.require(req);const order=await this.orders.visible(id,actor);
  must(order.customerId===actor.id || actor.roles.includes('admin'),'Unauthorized','forbidden');
  const pay=await this.db.paymentOrder.findFirst({where:{orderId:id,provider:'DEV_MOCK'},orderBy:{createdAt:'desc'}});
  must(pay,'No demo checkout exists','notfound');
  const result=await this.markPaid(pay.providerOrderId,`dev_payment_${pay.id}`,pay.amountPaise);
  return {simulated:true,neverRealMoney:true,...result};
 }
}
