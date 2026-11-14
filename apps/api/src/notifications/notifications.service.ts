import { Injectable } from '@nestjs/common';
import { Db } from '../core/db';
import type { Actor } from '../auth/auth.service';

type Entry={userId:string;role:string;sourceKey:string;type:string;title:string;body:string;href:string;createdAt:Date};
const STATUS:Record<string,[string,string]>={
 QUOTE_REQUESTED:['Quote requested','A customer has sent a tailoring request.'],
 QUOTE_PENDING:['Request accepted','Your tailor accepted the request and will prepare a quote.'],
 TAILOR_DECLINED:['Request declined','The tailor cannot take this order.'],
 QUOTE_READY:['Quotation received','Your tailor has sent a quotation for review.'],
 QUOTE_ACCEPTED:['Quote accepted','Your customer accepted the quotation.'],
 PAYMENT_CONFIRMED:['Payment confirmed','Payment is confirmed for this tailoring order.'],
 PAYMENT_FAILED:['Payment needs attention','A payment attempt did not complete.'],
 PICKUP_SCHEDULED:['Pickup scheduled','Your garment pickup has been scheduled.'],
 INBOUND_TRANSIT:['Garment collected','Your garments have been collected by a delivery partner.'],
 MATERIAL_RECEIVED:['Fabric received','The tailor received your garment materials.'],
 IN_PRODUCTION:['Stitching started','Your garment is now in production.'],
 QUALITY_CHECK:['Quality check','Your garment has reached quality inspection.'],
 RETURN_PICKUP_SCHEDULED:['Garment ready','Your finished garment is ready for pickup from the tailor.'],
 OUTBOUND_TRANSIT:['Out for delivery','Your finished garment is on its way.'],
 DELIVERED:['Delivery completed','Your garment has been delivered.'],
 COMPLETED:['Order completed','The order was completed successfully.'],
 DISPUTED:['Claim submitted','A claim was registered for your order.'],
 MATERIAL_ISSUE:['Material issue','The tailor reported a problem with the supplied garment.'],
 CANCELLED:['Order cancelled','Your tailoring order was cancelled.']
};
@Injectable()
export class NotificationsService {
 private recent=new Map<string,number>();
 constructor(private readonly db:Db){}
 private scope(actor:Actor){return {userId:actor.id,role:{in:[...new Set([...actor.roles,'customer'])]}};}
 private add(rows:Entry[],userId:string|undefined|null,role:string,sourceKey:string,type:string,title:string,body:string,href:string,createdAt:Date){
  if(userId)rows.push({userId,role,sourceKey,type,title,body,href,createdAt});
 }
 async project(actor:Actor){
  const now=Date.now(),last=this.recent.get(actor.id)||0;
  if(now-last<12000)return;
  this.recent.set(actor.id,now);
  if(this.recent.size>2000)this.recent.clear();
  try {
   const cutoff=new Date(now-30*86400000);
   const rows:Entry[]=[];
   const ownOrders=await this.db.order.findMany({where:{customerId:actor.id},select:{id:true,orderNumber:true},take:100,orderBy:{createdAt:'desc'}});
   const orderIds=ownOrders.map(o=>o.id),numbers=new Map(ownOrders.map(o=>[o.id,o.orderNumber]));
   if(orderIds.length){
    const [events,quotes,refunds,logistics]=await Promise.all([
     this.db.orderStatusEvent.findMany({where:{orderId:{in:orderIds},createdAt:{gte:cutoff}},orderBy:{createdAt:'desc'},take:150}),
     this.db.quote.findMany({where:{orderId:{in:orderIds},createdAt:{gte:cutoff}},orderBy:{createdAt:'desc'},take:90}),
     this.db.refund.findMany({where:{orderId:{in:orderIds},createdAt:{gte:cutoff}},orderBy:{createdAt:'desc'},take:90}),
     this.db.logisticsHandoff.findMany({where:{job:{orderId:{in:orderIds}},occurredAt:{gte:cutoff}},include:{job:{select:{orderId:true,direction:true}}},orderBy:{occurredAt:'desc'},take:100})
    ]);
    for(const e of events){const title=STATUS[e.to];if(title&&e.to!=='QUOTE_READY')this.add(rows,actor.id,'customer','order:'+e.id,'ORDER',title[0],title[1]+' · '+(numbers.get(e.orderId)||'Order'),'/orders/'+e.orderId,e.createdAt);}
    for(const q of quotes)this.add(rows,actor.id,'customer','quote:'+q.id,'QUOTE','New quotation received','Review your tailor’s quotation for '+(numbers.get(q.orderId)||'your order'),'/orders/'+q.orderId,q.createdAt);
    for(const f of refunds)this.add(rows,actor.id,'customer','refund:'+f.id+':'+f.status,'REFUND','Refund '+f.status.toLowerCase().replaceAll('_',' '),'Refund status changed for '+(numbers.get(f.orderId)||'your order'),'/orders/'+f.orderId,f.updatedAt);
    for(const h of logistics){
     const pickup=h.job.direction==='INBOUND'||h.job.direction==='REWORK_INBOUND';
     const label=h.step==='SENDER_PICKUP'?(pickup?'Garment picked up':'Out for delivery'):(pickup?'Garment reached tailor':'Delivery completed');
     this.add(rows,actor.id,'customer','handoff:'+h.id,'DELIVERY',label,'Verified parcel handoff recorded.','/orders/'+h.job.orderId,h.occurredAt);
    }
   }
   if(actor.roles.some(r=>r==='tailor_owner'||r==='tailor_staff')){
    const owned=await this.db.tailor.findMany({where:{ownerId:actor.id},select:{id:true},take:20});
    const ids=[...new Set([...actor.tailorIds,...owned.map(t=>t.id)])];
    if(ids.length){
     const orders=await this.db.order.findMany({where:{tailorId:{in:ids}},select:{id:true,orderNumber:true},orderBy:{createdAt:'desc'},take:110});
     const orderIds=orders.map(o=>o.id),num=new Map(orders.map(o=>[o.id,o.orderNumber]));
     if(orderIds.length){
      const [events,reviews,payouts]=await Promise.all([
       this.db.orderStatusEvent.findMany({where:{orderId:{in:orderIds},createdAt:{gte:cutoff}},orderBy:{createdAt:'desc'},take:140}),
       this.db.review.findMany({where:{orderId:{in:orderIds},createdAt:{gte:cutoff}},take:80,orderBy:{createdAt:'desc'}}),
       this.db.tailorPayout.findMany({where:{orderId:{in:orderIds},createdAt:{gte:cutoff}},take:80,orderBy:{createdAt:'desc'}})
      ]);
      for(const e of events)if(['QUOTE_REQUESTED','QUOTE_ACCEPTED','PAYMENT_CONFIRMED','MATERIAL_RECEIVED','IN_PRODUCTION','COMPLETED','DISPUTED'].includes(e.to)){
       const title=STATUS[e.to]||['Order update','Your order status has changed.'];
       this.add(rows,actor.id,actor.roles.includes('tailor_owner')?'tailor_owner':'tailor_staff','tailor-order:'+e.id,'ORDER',e.to==='QUOTE_REQUESTED'?'New order request':title[0],title[1]+' · '+(num.get(e.orderId)||'Order'),'/tailor/orders/'+e.orderId,e.createdAt);
      }
      for(const r of reviews)this.add(rows,actor.id,actor.roles.includes('tailor_owner')?'tailor_owner':'tailor_staff','review:'+r.id,'REVIEW','New customer review','A customer left a review on '+(num.get(r.orderId)||'an order'),'/tailor/orders/'+r.orderId,r.createdAt);
      for(const p of payouts)this.add(rows,actor.id,actor.roles.includes('tailor_owner')?'tailor_owner':'tailor_staff','payout:'+p.id+':'+p.status,'PAYOUT','Payout '+p.status.toLowerCase().replaceAll('_',' '),'Payout update for '+(num.get(p.orderId)||'an order'),'/tailor/earnings',p.paidAt||p.createdAt);
      const courierJobs=await this.db.logisticsJob.findMany({where:{orderId:{in:orderIds},courierId:{not:null},updatedAt:{gte:cutoff}},take:100,orderBy:{updatedAt:'desc'}});
      for(const job of courierJobs)this.add(rows,actor.id,actor.roles.includes('tailor_owner')?'tailor_owner':'tailor_staff',
       'tailor-courier:'+job.id,'DELIVERY','Courier assigned',
       'A delivery partner has been assigned to '+(num.get(job.orderId)||'an order'),'/tailor/orders/'+job.orderId,job.updatedAt);
     }
    }
   }
   if(actor.roles.includes('courier')){
    const partner=await this.db.deliveryPartner.findUnique({where:{userId:actor.id}});
    if(partner?.status==='APPROVED'){
     const [assigned,available]=await Promise.all([
      this.db.logisticsJob.findMany({where:{courierId:actor.id,updatedAt:{gte:cutoff}},take:90,orderBy:{updatedAt:'desc'}}),
      this.db.logisticsJob.findMany({where:{courierId:null,status:{in:['UNASSIGNED','PICKUP_SCHEDULED']},createdAt:{gte:cutoff},order:{OR:[{pickupAddress:{pincode:partner.servicePincode}},{returnAddress:{pincode:partner.servicePincode}},{tailor:{pincode:partner.servicePincode}}]}},take:35,orderBy:{createdAt:'desc'}})
     ]);
     for(const j of assigned)this.add(rows,actor.id,'courier','assigned:'+j.id,'DELIVERY','Delivery assignment','You have a delivery job assigned.','/delivery',j.updatedAt);
     const handoffs=await this.db.logisticsHandoff.findMany({where:{job:{courierId:actor.id},occurredAt:{gte:cutoff}},take:100,orderBy:{occurredAt:'desc'}});
     for(const handoff of handoffs){
      this.add(rows,actor.id,'courier','courier-handoff:'+handoff.id,'DELIVERY',
       'Handoff verified','A parcel handoff was verified and recorded.','/delivery',handoff.occurredAt);
     }
     for(const j of available)this.add(rows,actor.id,'courier','available:'+j.id,'DELIVERY','New delivery job nearby','A pickup or return job is available in your service area.','/delivery',j.createdAt);
    }
   }
   if(actor.roles.includes('admin')||actor.roles.includes('finance')){
    const [tailors,partners,disputes,failed,audits]=await Promise.all([
     this.db.tailor.findMany({where:{createdAt:{gte:cutoff}},take:80,orderBy:{createdAt:'desc'}}),
     this.db.deliveryPartner.findMany({where:{createdAt:{gte:cutoff}},take:80,orderBy:{createdAt:'desc'}}),
     this.db.dispute.findMany({where:{createdAt:{gte:cutoff}},take:80,orderBy:{createdAt:'desc'}}),
     this.db.logisticsJob.findMany({where:{status:'FAILED_ATTEMPT',updatedAt:{gte:cutoff}},take:80,orderBy:{updatedAt:'desc'}}),
     this.db.auditLog.findMany({where:{createdAt:{gte:cutoff},action:{in:['REFUND_ESCALATED','MATERIAL_ISSUE_REVIEWED','REFUND_REQUESTED','DELIVERY_ATTEMPT_FAILED']}},take:80,orderBy:{createdAt:'desc'}})
    ]);
    for(const t of tailors)if(actor.roles.includes('admin')&&t.status==='PENDING')this.add(rows,actor.id,actor.roles.includes('admin')?'admin':'finance','tailor-pending:'+t.id,'APPROVAL','Tailor approval request','A new tailor shop is awaiting verification.','/admin/tailors',t.createdAt);
    for(const p of partners)if(actor.roles.includes('admin'))this.add(rows,actor.id,actor.roles.includes('admin')?'admin':'finance','rider-application:'+p.id,'APPROVAL','New delivery partner application','A local delivery partner has applied.','/admin/delivery-partners',p.createdAt);
    for(const d of disputes)if(actor.roles.includes('admin'))this.add(rows,actor.id,actor.roles.includes('admin')?'admin':'finance','dispute:'+d.id,'CLAIM','New customer claim','A claim needs operations review.','/admin/disputes',d.createdAt);
    for(const j of failed)if(actor.roles.includes('admin'))this.add(rows,actor.id,actor.roles.includes('admin')?'admin':'finance','delivery-failed:'+j.id,'DELIVERY','Delivery exception','A courier delivery attempt needs review.','/admin/logistics',j.updatedAt);
    for(const a of audits){
     const financeAction=a.action.startsWith('REFUND_');
     if(actor.roles.includes('admin'))this.add(rows,actor.id,'admin','audit:'+a.id,'ADMIN','Operations action requires attention',a.action.replaceAll('_',' ').toLowerCase(),'/admin',a.createdAt);
     else if(actor.roles.includes('finance')&&financeAction)this.add(rows,actor.id,'finance','finance-audit:'+a.id,'FINANCE','Refund review update',a.action.replaceAll('_',' ').toLowerCase(),'/admin/finance',a.createdAt);
    }
    if(actor.roles.includes('admin')||actor.roles.includes('finance')){
     const exceptions=await this.db.orderStatusEvent.findMany({where:{createdAt:{gte:cutoff},to:{in:['PAYMENT_FAILED','MATERIAL_ISSUE','DISPUTED']}},take:80,orderBy:{createdAt:'desc'}});
     for(const item of exceptions){
      if(!actor.roles.includes('admin')&&item.to!=='PAYMENT_FAILED')continue;
      this.add(rows,actor.id,actor.roles.includes('admin')?'admin':'finance','exception:'+item.id,'ADMIN',
       item.to==='PAYMENT_FAILED'?'Payment exception':'Order needs manual review',
       'An order requires attention from StitchMate operations.',
       actor.roles.includes('admin')?'/admin/orders':'/admin/finance',item.createdAt);
     }
    }
   }
   if(rows.length)await this.db.notification.createMany({data:rows,skipDuplicates:true});
  }catch(e){this.recent.delete(actor.id);throw e;}
 }
 async list(actor:Actor,limit=20,cursor?:string){
  await this.project(actor);
  const scope=this.scope(actor);
  const where={...scope};
  if(cursor){
   const existing=await this.db.notification.findFirst({where:{id:cursor,...scope},select:{id:true}});
   if(!existing)return {items:[],nextCursor:null,unreadCount:await this.db.notification.count({where:{...where,readAt:null}})};
  }
  const [items,unreadCount]=await Promise.all([
   this.db.notification.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:Math.min(limit,50)+1,...(cursor?{cursor:{id:cursor},skip:1}:{})}),
   this.db.notification.count({where:{...where,readAt:null}})
  ]);
  return {items:items.slice(0,limit),nextCursor:items.length>limit?items[limit-1]?.id:null,unreadCount};
 }
 async snapshot(actor:Actor){
  await this.project(actor);
  const scope=this.scope(actor);
  const [latest,unreadCount]=await Promise.all([
   this.db.notification.findFirst({where:scope,select:{id:true,createdAt:true},orderBy:[{createdAt:'desc'},{id:'desc'}]}),
   this.db.notification.count({where:{...scope,readAt:null}})
  ]);
  return {latestId:latest?.id||null,unreadCount};
 }
 async markRead(actor:Actor,id:string){
  await this.db.notification.updateMany({where:{id,...this.scope(actor),readAt:null},data:{readAt:new Date()}});
  return {success:true};
 }
 async markAllRead(actor:Actor){
  await this.db.notification.updateMany({where:{...this.scope(actor),readAt:null},data:{readAt:new Date()}});
  return {success:true};
 }
 async preference(actor:Actor){
  const p=await this.db.notificationPreference.findUnique({where:{userId:actor.id}});
  return {soundEnabled:p?.soundEnabled??false};
 }
 async setPreference(actor:Actor,soundEnabled:boolean){
  const value=await this.db.notificationPreference.upsert({where:{userId:actor.id},create:{userId:actor.id,soundEnabled},update:{soundEnabled}});
  return {soundEnabled:value.soundEnabled};
 }
}