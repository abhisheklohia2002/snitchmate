import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const base = 'http://127.0.0.1:4010/api/v1';
const origin = 'http://localhost:3000';
let checks = 0;
const note = message => { checks++; console.log('PASS ' + checks + ': ' + message); };
async function request(method,path,body,account,expected=method==='POST'?201:200) {
  const res = await fetch(base+path,{
    method,
    headers:{
      ...(body===undefined?{}:{'Content-Type':'application/json'}),
      ...(method==='GET'?{}:{Origin:origin}),
      ...(account?{Cookie:account.cookie}:{})
    },
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const value = await res.json().catch(()=>null);
  assert.equal(res.status,expected,method+' '+path+' expected '+expected+' but got '+res.status+' '+JSON.stringify(value));
  return value;
}
async function account(suffix,name,role='customer') {
  const user=await db.user.create({data:{phone:'+9199800'+suffix,name,roles:{create:{role}}}});
  const token=randomBytes(48).toString('base64url');
  await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+86400000)}});
  return {id:user.id,cookie:'sm_session='+token,phone:user.phone};
}
function fixturePhoto(owner,purpose) {
  return db.uploadedFile.create({data:{ownerId:owner.id,storageKey:'ci/'+randomUUID()+'.jpg',mimeType:'image/jpeg',sizeBytes:123,purpose,status:'VERIFIED'}});
}
async function handoff(rider,jobId,step,proofId,count=1){
  await request('POST','/courier/jobs/'+jobId+'/otp',{step},rider);
  let code;
  for(let i=0;i<30;i++){
    const log=readFileSync('/tmp/stitchmate-e2e-api.log','utf8');
    const match=[...log.matchAll(/\[DEV ONLY\] HANDOFF_OTP[^\n]*: ([0-9]{6})/g)].at(-1);
    if(match){code=match[1];break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.match(code||'',/^\d{6}$/,'mock OTP was not logged for the latest handoff');
  const data={step,otp:code,itemCount:count,sealId:'SEAL-CI-123',conditionNote:'All garment pieces counted, seal intact, evidence checked',proofFileId:proofId};
  await request('POST','/courier/jobs/'+jobId+'/handoffs',{...data,itemCount:count+1},rider,400);
  const proof=await request('POST','/courier/jobs/'+jobId+'/handoffs',data,rider);
  note(step+' handoff verified with mock OTP and photo fixture');
  return proof;
}
async function run(){
  const stamp=String(Date.now()).slice(-6);
  const admin=await account(stamp+'01','CI Administrator','admin');
  const owner=await account(stamp+'02','CI Tailor');
  const customer=await account(stamp+'03','CI Customer');
  const rider=await account(stamp+'04','CI Delivery Rider');
  const outsider=await account(stamp+'05','CI Outsider');
  const category=await db.serviceCategory.findUniqueOrThrow({where:{code:'HEM'}});
  const tailor=await db.tailor.create({data:{
    ownerId:owner.id,slug:'ci-tailor-'+randomUUID().slice(0,8),shopName:'CI Local Tailor',
    description:'Private automated test workshop',pincode:'110086',address:'CI test street, Delhi',
    status:'APPROVED',verifiedAt:new Date(),zones:{create:{pincode:'110086'}},
    services:{create:{categoryId:category.id,basePricePaise:25000n,minDays:3,maxDays:7}}
  }});
  await db.userRole.create({data:{userId:owner.id,role:'tailor_owner',tailorId:tailor.id}});
  const image=await fixturePhoto(owner,'DESIGN');
  const before=await fixturePhoto(customer,'BEFORE');
  const courierProof=await fixturePhoto(rider,'HANDOFF');
  const qcProof=await fixturePhoto(owner,'QC');
  const address=await db.address.create({data:{
    userId:customer.id,label:'Home',name:'CI Customer',phone:customer.phone,line1:'CI test pickup street',
    city:'Delhi',state:'Delhi',pincode:'110086'
  }});
  const gigBody={
    tailorId:tailor.id,categoryId:category.id,title:'Perfect jeans hemming and alterations',
    description:'Precise tailoring and garment hemming for denim, cotton trousers and casual wear, with hand-finished seams.',
    imageRightsConfirmed:true,imageFileIds:[image.id],
    packages:[
      {tier:'BASIC',title:'Essential hemming',description:'Basic length alteration and secure seam finish',pricePaise:'25000',deliveryDays:7,revisions:1},
      {tier:'STANDARD',title:'Premium tailoring',description:'Length alteration, fitting check and fine finishing',pricePaise:'39000',deliveryDays:5,revisions:2},
      {tier:'PREMIUM',title:'Signature express',description:'Priority alteration with detailed hand finishing',pricePaise:'55000',deliveryDays:3,revisions:3}
    ]
  };
  await request('POST','/gigs',gigBody,customer,403);
  const gig=await request('POST','/gigs',gigBody,owner);
  assert.equal(gig.status,'DRAFT');
  assert.equal((await request('GET','/gigs')).total,0);
  await request('POST','/gigs/'+gig.id+'/publish',{},owner);
  assert.equal((await request('GET','/gigs?pincode=110086')).total,1);
  const detail=await request('GET','/gigs/'+gig.slug);
  assert.equal(detail.packages.length,3);
  note('tailor can create and publish tiered gig; listing respects drafts, ownership and service area');
  const photoAccess=await fetch(base+'/gigs/'+gig.slug+'/images/'+image.id,{redirect:'manual'});
  assert.equal(photoAccess.status,302,'published permitted image should redirect to a presigned URL');
  note('published portfolio photo has a short-lived private bucket URL');
  const orderData={tailorId:tailor.id,serviceType:'ALTERATION',pickupAddressId:address.id,
    returnAddressId:address.id,gigId:gig.id,gigTier:'BASIC',
    items:[{categoryId:category.id,quantity:1,instructions:'Shorten the trouser legs by three centimetres and retain original hem',fileIds:[before.id]}]};
  await request('POST','/orders',{...orderData,gigTier:'INVALID'},customer,400);
  const order=await request('POST','/orders',orderData,customer);
  const persisted=await db.order.findUniqueOrThrow({where:{id:order.id}});
  assert.equal(persisted.gigTier,'BASIC');
  assert.equal(String(persisted.gigPackagePricePaise),'25000');
  note('gig booking snapshots selected package and enforces validated tier');
  await request('POST','/orders/'+order.id+'/request-quote',{},customer);
  await request('POST','/tailor/requests/'+order.id+'/accept',{},owner);
  const issued=await request('POST','/tailor/orders/'+order.id+'/quotes',{lines:[{orderItemId:order.items[0].id,description:'CI denim hem',quantity:1,unitPricePaise:'25000'}],
    logisticsPaise:'14900',taxPaise:'0',discountPaise:'0',validHours:48},owner);
  await request('POST','/orders/'+order.id+'/quotes/'+issued.id+'/accept',{},customer);
  await request('POST','/orders/'+order.id+'/checkout',undefined,customer,400); // idempotency key required
  // Checkout with explicit stable idempotency key; normal business API, no external payment.
  const paymentRes=await fetch(base+'/orders/'+order.id+'/checkout',{method:'POST',headers:{Cookie:customer.cookie,Origin:origin,'Idempotency-Key':'ci-checkout-'+order.id}});
  assert.equal(paymentRes.status,201);
  const checkout=await paymentRes.json();
  assert.equal(checkout.simulated,true);
  await request('POST','/dev/payments/'+order.id+'/confirm',{},customer);
  note('quote acceptance and development-only payment simulation completed');
  const pickup=await request('POST','/orders/'+order.id+'/pickup-slots',{scheduledAt:new Date(Date.now()+3*3600000).toISOString()},customer);
  const partner=await request('POST','/delivery/onboarding',{displayName:'CI Rider',vehicleType:'BIKE',servicePincode:'110086'},rider);
  await request('GET','/delivery/jobs/available',undefined,rider,403);
  await request('POST','/admin/delivery-partners/'+partner.id+'/approve',{},admin);
  await request('POST','/delivery/availability',{available:true},rider);
  const available=await request('GET','/delivery/jobs/available',undefined,rider);
  assert.ok(available.some(j=>j.id===pickup.id),'inbound pickup job should be visible to approved online rider');
  await request('POST','/delivery/jobs/'+pickup.id+'/accept',{},outsider,403);
  await request('POST','/delivery/jobs/'+pickup.id+'/accept',{},rider);
  await request('POST','/delivery/jobs/'+pickup.id+'/accept',{},rider,409);
  note('admin verifies rider; only approved available rider can atomically accept delivery job');
  await handoff(rider,pickup.id,'SENDER_PICKUP',courierProof.id);
  await handoff(rider,pickup.id,'RECIPIENT_DROPOFF',courierProof.id);
  assert.equal((await request('GET','/orders/'+order.id,undefined,customer)).status,'MATERIAL_RECEIVED');
  await request('POST','/tailor/orders/'+order.id+'/receipt',{accepted:true,note:'All fabric received intact'},owner);
  await request('POST','/tailor/orders/'+order.id+'/progress',{itemId:order.items[0].id,status:'READY_FOR_QC',note:'Alterations complete',fileId:qcProof.id},owner);
  await request('POST','/tailor/orders/'+order.id+'/ready-for-qc',{},owner);
  await request('POST','/admin/orders/'+order.id+'/approve-qc',{},admin);
  note('tailor confirms material, completes production, and admin approves QC');
  const availableOut=await request('GET','/delivery/jobs/available',undefined,rider);
  const outbound=availableOut.find(j=>j.direction==='OUTBOUND');
  assert.ok(outbound,'QC should generate return delivery job');
  await request('POST','/delivery/jobs/'+outbound.id+'/accept',{},rider);
  await handoff(rider,outbound.id,'SENDER_PICKUP',courierProof.id);
  await handoff(rider,outbound.id,'RECIPIENT_DROPOFF',courierProof.id);
  await request('POST','/orders/'+order.id+'/confirm-delivery',{},customer);
  await request('POST','/orders/'+order.id+'/reviews',{score:5,text:'Great tailoring and pickup service'},customer);
  const finalGig=await request('GET','/gigs/'+gig.slug);
  assert.equal(finalGig.rating,5);
  assert.equal(finalGig.reviewCount,1);
  note('finished garment delivered to customer; customer confirmation and gig review recorded');
  const finalOrder=await db.order.findUniqueOrThrow({where:{id:order.id},include:{logistics:{include:{handoffs:true}}}});
  assert.equal(finalOrder.status,'COMPLETED');
  assert.equal(finalOrder.logistics.length,2);
  assert.equal(finalOrder.logistics.every(j=>j.handoffs.length===2),true);
  note('both physical delivery legs have exactly two authenticated custody handoffs');
  console.log('E2E PASS: '+checks+' real PostgreSQL + Nest HTTP assertions, mock OTP and mock payment, fixture media metadata');
}
try{await run();}finally{await db.$disconnect();}