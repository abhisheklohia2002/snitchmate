import { ConflictException, ForbiddenException, Injectable, NotFoundException, HttpException, BadRequestException } from '@nestjs/common';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Prisma } from '@prisma/client';
import { Db } from '../core/db';
import type { Actor } from '../auth/auth.service';
import { briefSchema, emptyRequirements, aiRequirements, messageSchema, type AiRequirements } from './schemas/requirements';
import { MatchingService } from './services/matching.service';
import { OpenAiProvider } from './providers/openai.provider';

const s3=new S3Client({region:process.env.AWS_REGION??'us-east-1',endpoint:process.env.S3_ENDPOINT||undefined,forcePathStyle:process.env.S3_FORCE_PATH_STYLE==='true',credentials:process.env.S3_ACCESS_KEY_ID&&process.env.S3_SECRET_ACCESS_KEY?{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}:undefined});
const uuidRegex=/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const expiry=()=>new Date(Date.now()-30*86400000);
@Injectable()
export class AiService {
 constructor(private readonly db:Db,private readonly matching:MatchingService,private readonly model:OpenAiProvider){}
 configuration(){return {enabled:this.model.enabled(),model:this.model.enabled()?this.model.model():null,maxImages:3,maxImageBytes:this.maxImageSize(),dailyLimit:this.limit()};}
 private maxImageSize(){return Math.min(Math.max(Number(process.env.AI_MAX_IMAGE_BYTES)||5242880,1),5242880);}
 private limit(){return Math.min(Math.max(Number(process.env.AI_MAX_REQUESTS_PER_USER_PER_DAY)||30,1),100);}
 private async own(userId:string,id:string){
  if(!uuidRegex.test(id))throw new NotFoundException('Conversation not found');
  const c=await this.db.aiConversation.findFirst({where:{id,userId}});
  if(!c)throw new NotFoundException('Conversation not found');
  return c;
 }
 private async files(userId:string,ids:string[]){
  const unique=[...new Set(ids)];
  if(unique.length!==ids.length||ids.length>3)throw new BadRequestException('Choose at most three unique reference images');
  if(!ids.length)return [];
  const found=await this.db.uploadedFile.findMany({where:{id:{in:ids},ownerId:userId,status:'VERIFIED',purpose:{in:['DESIGN','BEFORE']},mimeType:{in:['image/jpeg','image/png','image/webp']},sizeBytes:{lte:this.maxImageSize()}}});
  if(found.length!==ids.length)throw new ForbiddenException('One or more reference images are unavailable');
  return ids.map(id=>found.find(f=>f.id===id)!);
 }
 private async charge(userId:string){
  const day=new Date().toISOString().slice(0,10);
  await this.db.aiDailyUsage.upsert({where:{userId_day:{userId,day}},create:{userId,day,requests:0},update:{}});
  const ok=await this.db.aiDailyUsage.updateMany({where:{userId,day,requests:{lt:this.limit()},tokensUsed:{lt:50000}},data:{requests:{increment:1}}});
  if(ok.count!==1)throw new HttpException('You have reached the daily AI request limit.',429);
 }
 async list(actor:Actor){
  return this.db.aiConversation.findMany({where:{userId:actor.id,updatedAt:{gte:expiry()}},select:{id:true,title:true,createdAt:true,updatedAt:true,confirmedAt:true},orderBy:{updatedAt:'desc'},take:30});
 }
 async create(actor:Actor){
  await this.db.aiConversation.deleteMany({where:{userId:actor.id,updatedAt:{lt:expiry()}}});
  const active=await this.db.aiConversation.count({where:{userId:actor.id,updatedAt:{gte:expiry()}}});
  if(active>=30)throw new ConflictException('Maximum 30 active conversations. Continue an existing one.');
  return this.db.aiConversation.create({data:{userId:actor.id},select:{id:true,title:true,createdAt:true}});
 }
 async get(actor:Actor,id:string){
  const c=await this.own(actor.id,id);
  const messages=await this.db.aiMessage.findMany({where:{conversationId:c.id},orderBy:[{createdAt:'desc'},{id:'desc'}],take:60,select:{id:true,role:true,content:true,imageFileIds:true,createdAt:true}});
  return {id:c.id,title:c.title,requirements:c.requirements??emptyRequirements,brief:c.brief,referenceImageIds:c.referenceImageIds??[],confirmedAt:c.confirmedAt,messages:messages.reverse()};
 }
 async speak(actor:Actor,id:string,unknown:unknown){
  if(!this.model.enabled())return {enabled:false,error:'AI Copilot is not configured. Ask an administrator to configure OPENAI_API_KEY.'};
  const input=messageSchema.parse(unknown);
  const c=await this.own(actor.id,id);
  if(c.updatedAt<expiry())throw new ConflictException('This conversation has expired; start a new one.');
  const prior=await this.db.aiMessage.findFirst({where:{conversationId:c.id,requestId:input.requestId,role:'USER'}});
  if(prior){
   const answer=await this.db.aiMessage.findFirst({where:{conversationId:c.id,requestId:input.requestId,role:'ASSISTANT'}});
   if(!answer)throw new ConflictException('This request is already processing.');
   return {reply:answer.content,requirements:c.requirements??emptyRequirements,recommendations:await this.matching.find(aiRequirements.parse(c.requirements??emptyRequirements)),conversationId:c.id,deduplicated:true};
  }
  const count=await this.db.aiMessage.count({where:{conversationId:c.id,role:'USER'}});
  if(count>=50)throw new ConflictException('This conversation has reached its message limit. Start a new idea.');
  const images=await this.files(actor.id,input.imageFileIds);
  const previousIds=Array.isArray(c.referenceImageIds)?c.referenceImageIds.filter((x):x is string=>typeof x==='string'):[];
  const imageIds=[...new Set([...previousIds,...input.imageFileIds])].slice(-3);
  const priorMessages=await this.db.aiMessage.findMany({where:{conversationId:c.id},select:{role:true,content:true},orderBy:{createdAt:'desc'},take:8});
  // Claim the request ID before charging or calling the model, even under parallel retries.
  let userMessage;
  try{
   userMessage=await this.db.aiMessage.create({data:{conversationId:c.id,role:'USER',content:input.message,requestId:input.requestId,imageFileIds:input.imageFileIds}});
  }catch(e){
   if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')throw new ConflictException('This message is already being processed.');
   throw e;
  }
  try{await this.charge(actor.id);}
  catch(e){await this.db.aiMessage.delete({where:{id:userMessage.id}});throw e;}
  const urls=await Promise.all(images.map(async f=>({url:await getSignedUrl(s3,new GetObjectCommand({Bucket:process.env.S3_BUCKET??'stitchmate-private',Key:f.storageKey}),{expiresIn:90})})));
  let result;
  try{
   result=await this.model.complete({message:input.message,history:priorMessages.reverse(),previous:aiRequirements.parse(c.requirements??emptyRequirements),images:urls});
  }catch(e){
   // The attempted user message is retained so retry uses a new explicit requestId.
   await this.db.aiMessage.create({data:{conversationId:c.id,role:'SYSTEM',content:'The AI service did not respond. Please try again.'}});
   throw e;
  }
  const requirements=aiRequirements.parse(result.requirements);
  const recommendations=await this.matching.find(requirements);
  await this.db.$transaction(async tx=>{
   await tx.aiMessage.create({data:{conversationId:c.id,role:'ASSISTANT',content:result.reply,requestId:input.requestId}});
   await tx.aiConversation.update({where:{id:c.id},data:{
    title:c.title==='New tailoring idea'?input.message.slice(0,78):undefined,
    requirements:requirements as Prisma.InputJsonValue,
    referenceImageIds:imageIds as Prisma.InputJsonValue,
    confirmedAt:null,brief:Prisma.DbNull
   }});
   const today=new Date().toISOString().slice(0,10);
   await tx.aiDailyUsage.update({where:{userId_day:{userId:actor.id,day:today}},data:{tokensUsed:{increment:result.tokens}}});
  });
  return {enabled:true,reply:result.reply,requirements,recommendations,conversationId:c.id};
 }
 async confirm(actor:Actor,id:string,unknown:unknown){
  const c=await this.own(actor.id,id);
  const brief=briefSchema.parse(unknown);
  const images=Array.isArray(c.referenceImageIds)?c.referenceImageIds:[];
  if(!brief.imageFileIds.every(x=>images.includes(x)))throw new ForbiddenException('Brief contains an image outside your conversation.');
  await this.files(actor.id,brief.imageFileIds);
  const req=aiRequirements.parse({...aiRequirements.parse(c.requirements??emptyRequirements),...brief,missingInformation:[],uncertainty:[]});
  const gigs=await this.matching.find(req);
  const gig=gigs.find(g=>g.id===brief.gigId&&g.tailor.id===brief.tailorId&&g.categoryId===brief.categoryId&&g.serviceType===brief.serviceType);
  if(!gig||!gig.packages.some(p=>p.tier===brief.gigTier))throw new ConflictException('That gig/package is no longer eligible. Refresh the suggestions.');
  await this.db.aiConversation.update({where:{id:c.id},data:{brief:brief as Prisma.InputJsonValue,confirmedAt:new Date()}});
  return {confirmed:true,bookingUrl:'/book/'+encodeURIComponent(gig.tailor.id)+'?'+new URLSearchParams({
   gigId:gig.id,gigTier:brief.gigTier,categoryId:gig.categoryId,serviceType:gig.serviceType,aiConversation:c.id
  }).toString()};
 }
 async booking(actor:Actor,id:string){
  const c=await this.own(actor.id,id);
  if(!c.confirmedAt||!c.brief)throw new ForbiddenException('Confirm the brief before continuing to booking.');
  const brief=briefSchema.parse(c.brief);
  await this.files(actor.id,brief.imageFileIds);
  const requirements=aiRequirements.parse({...c.requirements,...brief,missingInformation:[],uncertainty:[]});
  const found=(await this.matching.find(requirements)).find(g=>g.id===brief.gigId&&g.tailor.id===brief.tailorId&&g.categoryId===brief.categoryId);
  if(!found||!found.packages.some(p=>p.tier===brief.gigTier))throw new ConflictException('The selected package is no longer available.');
  return {serviceType:brief.serviceType,categoryId:brief.categoryId,tailorId:brief.tailorId,gigId:brief.gigId,gigTier:brief.gigTier,referenceImageIds:brief.imageFileIds,
   instructions:brief.additionalInstructions,design:brief.design,garmentType:brief.garmentType};
 }
}
