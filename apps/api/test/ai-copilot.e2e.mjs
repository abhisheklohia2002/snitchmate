import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
const db=new PrismaClient();
const origin='http://localhost:3000';
const base='http://127.0.0.1:4010/api/v1';
const uuid=()=>randomUUID();
let checks=0;
function pass(label){console.log('AI PASS '+(++checks)+': '+label);}
async function account(label){
 const user=await db.user.create({data:{phone:'+9172'+String(Date.now()).slice(-7)+Math.floor(Math.random()*100).toString().padStart(2,'0'),name:label,roles:{create:{role:'customer'}}}});
 const token=randomBytes(48).toString('base64url');
 await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+86400000)}});
 return {id:user.id,cookie:'sm_session='+token};
}
async function req(method,path,user,body,expected=method==='POST'?201:200){
 const res=await fetch(base+path,{method,headers:{Origin:origin,...(user?{Cookie:user.cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},
  body:body===undefined?undefined:JSON.stringify(body)});
 const json=await res.json().catch(()=>null);
 assert.equal(res.status,expected,method+' '+path+' got '+res.status+' '+JSON.stringify(json));
 return json;
}
async function main(){
 const customer=await account('AI customer'),stranger=await account('AI stranger'),tailorOwner=await account('AI tailor');
 const category=await db.serviceCategory.findUniqueOrThrow({where:{code:'BLOUSE'}});
 const tailor=await db.tailor.create({data:{
  ownerId:tailorOwner.id,slug:'ai-test-'+uuid(),shopName:'AI Test Shop',description:'Private CI shop',
  pincode:'110086',address:'CI tailoring studio, Delhi',status:'APPROVED',
  zones:{create:{pincode:'110086'}},services:{create:{categoryId:category.id,basePricePaise:85000n,minDays:3,maxDays:8}}
 }});
 const gig=await db.gig.create({data:{
  tailorId:tailor.id,categoryId:category.id,slug:'ai-blouse-'+uuid(),title:'Custom wedding designer blouse',
  description:'Experienced blouse tailoring for customer-supplied fabric and measurements with finishing',status:'PUBLISHED',
  packages:{create:[
   {tier:'BASIC',title:'Standard blouse',description:'Custom stitching',pricePaise:120000n,deliveryDays:6,revisions:1},
   {tier:'PREMIUM',title:'Premium blouse',description:'High detail stitching',pricePaise:260000n,deliveryDays:4,revisions:2}
  ]}
 }});
 await db.gig.create({data:{tailorId:tailor.id,categoryId:category.id,slug:'ai-hidden-'+uuid(),title:'Unpublished blouse',description:'Not shown',status:'PAUSED',packages:{create:[{tier:'BASIC',title:'Hidden',description:'Not published',pricePaise:90000n,deliveryDays:3,revisions:1}]}}});
 const img=await db.uploadedFile.create({data:{ownerId:customer.id,storageKey:'ci/'+uuid()+'.jpg',mimeType:'image/jpeg',sizeBytes:2048,purpose:'DESIGN',status:'VERIFIED'}});
 const alienImage=await db.uploadedFile.create({data:{ownerId:stranger.id,storageKey:'ci/'+uuid()+'.jpg',mimeType:'image/jpeg',sizeBytes:2048,purpose:'DESIGN',status:'VERIFIED'}});
 await req('GET','/ai/config',null,undefined,401);
 const config=await req('GET','/ai/config',customer);
 assert.equal(config.enabled,true);
 pass('authenticated config and enablement');
 const conversation=await req('POST','/ai/conversations',customer,{});
 const id=conversation.id;
 await req('GET','/ai/conversations/'+id,stranger,undefined,404);
 await req('GET','/ai/conversations/'+uuid(),customer,undefined,404);
 pass('private conversation ownership enforced at database query');
 await req('POST','/ai/conversations/'+id+'/messages',customer,{message:'Hello',requestId:uuid(),imageFileIds:[alienImage.id]},403);
 await req('POST','/ai/conversations/'+id+'/messages',customer,{message:'Hello',requestId:uuid(),imageFileIds:[img.id,img.id]},400);
 await req('POST','/ai/conversations/'+id+'/messages',customer,{message:'A'.repeat(1700),requestId:uuid()},400);
 pass('foreign images, duplicate image ids and oversized chat inputs rejected');
 const key=uuid();
 const message={requestId:key,message:'I want a wedding blouse under 2000 in 110086 within seven days',imageFileIds:[img.id]};
 const result=await req('POST','/ai/conversations/'+id+'/messages',customer,message);
 assert.equal(result.enabled,true);
 assert.equal(result.requirements.garmentType,'Blouse');
 assert.equal(result.requirements.design.neckline,'Square neck');
 assert.ok(result.recommendations.some(g=>g.id===gig.id));
 assert.ok(result.recommendations.every(g=>g.id!==undefined&&g.packages.every(p=>Number(p.pricePaise)<=200000)));
 assert.ok(result.recommendations.find(g=>g.id===gig.id)?.packages.every(p=>p.tier!=='PREMIUM'));
 pass('OpenAI structured vision mock, schema validation and real published-gig budget filtering');
 const repeated=await req('POST','/ai/conversations/'+id+'/messages',customer,message);
 assert.equal(repeated.deduplicated,true);
 assert.equal((await db.aiMessage.count({where:{conversationId:id,role:'USER',requestId:key}})),1);
 pass('retry idempotency prevents duplicate requests and model charges');
 const state=await req('GET','/ai/conversations/'+id,customer);
 assert.equal(state.referenceImageIds[0],img.id);
 assert.ok(state.messages.some(m=>m.role==='ASSISTANT'));
 const filtered=await req('POST','/ai/matches',customer,{...result.requirements,budgetMax:100});
 assert.equal(filtered.length,0);
 const badLocation=await req('POST','/ai/matches',customer,{...result.requirements,pincode:'999999'});
 assert.equal(badLocation.length,0);
 await req('POST','/ai/matches',customer,{...result.requirements,pincode:'hello'},400);
 pass('deterministic matcher honors pincode, price and schema constraints');
 const selected=result.recommendations.find(g=>g.id===gig.id);
 assert.ok(selected);
 const brief={...result.requirements,imageFileIds:[img.id],gigId:gig.id,gigTier:'BASIC',categoryId:category.id,tailorId:tailor.id,
  additionalInstructions:'Stitch this blouse with a square neckline and full sleeves'};
 await req('POST','/ai/conversations/'+id+'/confirm',customer,{...brief,gigTier:'PREMIUM'},409);
 await req('POST','/ai/conversations/'+id+'/confirm',stranger,brief,404);
 const approved=await req('POST','/ai/conversations/'+id+'/confirm',customer,brief);
 assert.ok(approved.bookingUrl.includes('/book/'+tailor.id));
 const book=await req('GET','/ai/conversations/'+id+'/booking',customer);
 assert.equal(book.gigId,gig.id);
 assert.equal(book.instructions,brief.additionalInstructions);
 assert.deepEqual(book.referenceImageIds,[img.id]);
 await req('GET','/ai/conversations/'+id+'/booking',stranger,undefined,404);
 pass('customer-controlled brief, stale package rejection and original booking prefill URL');
 await req('POST','/ai/conversations/'+id+'/messages',customer,{message:'simulate-rate-limit',requestId:uuid()},429);
 await req('POST','/ai/conversations/'+id+'/messages',customer,{message:'one more please',requestId:uuid()},429);
 const used=await db.aiDailyUsage.findUniqueOrThrow({where:{userId_day:{userId:customer.id,day:new Date().toISOString().slice(0,10)}}});
 assert.equal(used.requests,3);
 pass('per-user daily quota is atomic, includes failed provider attempts and blocks overage');
 assert.equal((await req('GET','/ai/conversations',stranger)).length,0);
 console.log('AI E2E PASSED: '+checks+' grouped assertions');
}
try{await main();}finally{await db.$disconnect();}
