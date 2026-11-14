import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
const db=new PrismaClient();
const base='http://127.0.0.1:4010/api/v1';
const id=()=>randomUUID();
async function actor(role='customer'){
 const suffix=String(Date.now()).slice(-6)+Math.floor(Math.random()*1000).toString().padStart(3,'0');
 const user=await db.user.create({data:{phone:'+91731'+suffix,roles:{create:{role}}}});
 const token=randomBytes(48).toString('base64url');
 await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+86400000)}});
 return {...user,cookie:'sm_session='+token};
}
async function http(method,path,account,body,expected=200){
 const response=await fetch(base+path,{method,headers:{Origin:'http://localhost:3000',...(account?{Cookie:account.cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},
  body:body===undefined?undefined:JSON.stringify(body)});
 const value=await response.json().catch(()=>null);
 assert.equal(response.status,expected,method+' '+path+' status '+response.status+' '+JSON.stringify(value));
 return value;
}
async function main(){
 const customer=await actor(),stranger=await actor(),admin=await actor('admin'),owner=await actor();
 const category=await db.serviceCategory.findUniqueOrThrow({where:{code:'HEM'}});
 const tailor=await db.tailor.create({data:{ownerId:owner.id,slug:'notifier-'+id(),shopName:'Notifications CI Tailor',pincode:'110086',address:'Test',status:'APPROVED',services:{create:{categoryId:category.id,basePricePaise:25000n}}}});
 await db.userRole.create({data:{userId:owner.id,role:'tailor_owner',tailorId:tailor.id}});
 const address=await db.address.create({data:{userId:customer.id,label:'Home',name:'Notif Test',phone:customer.phone,line1:'Test',city:'Delhi',state:'Delhi',pincode:'110086'}});
 const order=await db.order.create({data:{orderNumber:'SM-NT-'+id().slice(0,8),customerId:customer.id,tailorId:tailor.id,pickupAddressId:address.id,returnAddressId:address.id,serviceType:'ALTERATION',status:'QUOTE_PENDING'}});
 const event=await db.orderStatusEvent.create({data:{orderId:order.id,from:'QUOTE_REQUESTED',to:'QUOTE_PENDING',actorId:owner.id}});
 const paymentEvent=await db.orderStatusEvent.create({data:{orderId:order.id,from:'PAYMENT_PENDING',to:'PAID',actorId:null,reason:'Verified payment capture'}});
 await http('GET','/notifications',null,undefined,401);
 const alice=await http('GET','/notifications',customer);
 assert.ok(alice.items.some(n=>n.sourceKey==='order:'+event.id),'customer receives own real status event');
 assert.ok(alice.items.some(n=>n.sourceKey==='order:'+paymentEvent.id&&n.title==='Payment confirmed'),'PAID transition creates payment confirmation');
 assert.ok(alice.unreadCount>=1);
 const item=alice.items.find(n=>n.sourceKey==='order:'+event.id);
 const other=await http('GET','/notifications',stranger);
 assert.ok(!other.items.some(n=>n.id===item.id),'other customer cannot see notification');
 const alien=await http('PATCH','/notifications/'+item.id+'/read',stranger);
 assert.equal(alien.success,true);
 const unchanged=await db.notification.findUniqueOrThrow({where:{id:item.id}});
 assert.equal(unchanged.readAt,null,'cross-account mark-read must not change data');
 await http('PATCH','/notifications/'+item.id+'/read',customer);
 assert.ok((await db.notification.findUniqueOrThrow({where:{id:item.id}})).readAt,'own read state persists');
 const before=await db.notification.count({where:{userId:customer.id,sourceKey:'order:'+event.id}});
 await http('GET','/notifications',customer);
 const after=await db.notification.count({where:{userId:customer.id,sourceKey:'order:'+event.id}});
 assert.equal(before,after,'projector dedupes source event');
 const forbidden=await db.notification.create({data:{userId:customer.id,role:'admin',sourceKey:'private-admin-'+id(),title:'Sensitive admin notification',body:'Only admins',type:'ADMIN'}});
 assert.ok(!(await http('GET','/notifications',customer)).items.some(n=>n.id===forbidden.id),'role-filter protects same-user admin content');
 await db.deliveryPartner.create({data:{userId:stranger.id,displayName:'Delivery CI',vehicleType:'BIKE',servicePincode:'110086'}});
 assert.ok((await http('GET','/notifications',admin)).items.some(n=>n.type==='APPROVAL'),'admin sees real pending delivery application');
 const preferences=await http('GET','/notifications/preferences',customer);
 assert.equal(preferences.soundEnabled,false,'sound is off by default');
 const updated=await http('PATCH','/notifications/preferences',customer,{soundEnabled:true});
 assert.equal(updated.soundEnabled,true);
 assert.equal((await http('GET','/notifications/preferences',customer)).soundEnabled,true,'sound setting persists');
 await http('PATCH','/notifications/read-all',customer);
 assert.equal((await http('GET','/notifications',customer)).unreadCount,0,'mark-all scope persists');
 const state=await http('GET','/notifications/state',customer);
 assert.ok(state.latestId&&typeof state.unreadCount==='number');
 const streamed=await fetch(base+'/notifications/stream',{headers:{Cookie:customer.cookie,Accept:'text/event-stream'}});
 assert.equal(streamed.status,200);
 assert.match(streamed.headers.get('content-type')||'',/text\/event-stream/);
 streamed.body?.cancel();
 console.log('PASS: notification role isolation, multi-user auth, deduplication, persisted read-state, preferences, SSE');
}
try{await main();}finally{await db.$disconnect();}