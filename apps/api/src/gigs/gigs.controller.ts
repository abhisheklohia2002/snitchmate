import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Request } from 'express';
import { Db } from '../core/db';
import { AuthService } from '../auth/auth.service';
import { must, parse } from '../core/http';
import { gigInputSchema } from '@stitchmate/contracts';

const uuid=z.string().uuid();
const editSchema=gigInputSchema.omit({tailorId:true});
const published={status:'PUBLISHED',tailor:{status:'APPROVED'}} as const;
const packageSelect={tier:true,title:true,description:true,pricePaise:true,deliveryDays:true,revisions:true,expressDays:true,expressPricePaise:true} as const;
const gigInclude={
 category:{select:{id:true,title:true,serviceType:true}},
 tailor:{select:{id:true,slug:true,shopName:true,pincode:true,turnaroundDays:true,status:true}},
 packages:{select:packageSelect,orderBy:{pricePaise:'asc' as const}},
 images:{select:{fileId:true,position:true},orderBy:{position:'asc' as const}},
} as const;
@Controller('gigs')
export class GigsController {
 constructor(private readonly db:Db,private readonly auth:AuthService){}
 private async ownership(actorId:string,tailorId:string,categoryId:string){
  const tailor=await this.db.tailor.findFirst({where:{id:tailorId,ownerId:actorId},include:{services:true}});
  must(tailor,'You do not own this tailor shop','forbidden');
  must(tailor.services.some(s=>s.categoryId===categoryId&&s.active),'Add this service to your shop first','conflict');
  const category=await this.db.serviceCategory.findFirst({where:{id:categoryId,active:true}});
  must(category,'Service category is unavailable','notfound');
 }
 private async gallery(actorId:string,ids:string[]){
  if(!ids.length)return;
  const files=await this.db.uploadedFile.findMany({where:{id:{in:ids},ownerId:actorId,status:'VERIFIED',mimeType:{in:['image/png','image/jpeg','image/webp']}}});
  must(files.length===ids.length,'All gallery photos must be verified image uploads owned by your account','forbidden');
 }
 @Get() async list(@Query('pincode') pincode?:string,@Query('categoryId') categoryId?:string,@Query('page') pageText?:string) {
  const page=Math.max(1,Math.min(1000,Number.parseInt(pageText??'1',10)||1));
  const category=categoryId?parse(uuid,categoryId):undefined;
  const pin=pincode?parse(z.string().regex(/^\d{6}$/),pincode):undefined;
  const where={...published,...(category?{categoryId:category}:{}),...(pin?{tailor:{status:'APPROVED',zones:{some:{pincode:pin,active:true}}}}:{})};
  const [items,total]=await Promise.all([
    this.db.gig.findMany({where,include:gigInclude,orderBy:{createdAt:'desc'},skip:(page-1)*12,take:12}),
    this.db.gig.count({where})
  ]);
  return {items,total,page,pageSize:12};
 }
 @Get('mine') async mine(@Req() req:Request){
  const actor=await this.auth.require(req);
  return this.db.gig.findMany({where:{tailor:{ownerId:actor.id}},include:gigInclude,orderBy:{createdAt:'desc'}});
 }
 @Get(':slug') async detail(@Param('slug') slug:string) {
  const gig=await this.db.gig.findUnique({where:{slug},include:{...gigInclude,orders:{where:{review:{isNot:null}},select:{review:{select:{score:true,text:true,createdAt:true}}},take:100,orderBy:{createdAt:'desc'}}}});
  must(gig?.status==='PUBLISHED'&&gig.tailor.status==='APPROVED','Gig unavailable','notfound');
  const reviews=gig.orders.flatMap(o=>o.review?[o.review]:[]);
  const {orders:_,...publicGig}=gig;
  return {...publicGig,rating:reviews.length?Math.round(reviews.reduce((a,b)=>a+b.score,0)/reviews.length*10)/10:null,reviewCount:reviews.length,reviews:reviews.slice(0,10)};
 }
 @Post() async create(@Req() req:Request,@Body() body:unknown){
  const actor=await this.auth.require(req);
  const input=parse(gigInputSchema,body);
  await this.ownership(actor.id,input.tailorId,input.categoryId);
  await this.gallery(actor.id,input.imageFileIds);
  const slug=input.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)+'-'+randomUUID().slice(0,8);
  const result=await this.db.gig.create({data:{
    tailorId:input.tailorId,categoryId:input.categoryId,title:input.title,description:input.description,slug,
    packages:{create:input.packages.map(p=>({...p,pricePaise:BigInt(p.pricePaise),expressPricePaise:p.expressPricePaise?BigInt(p.expressPricePaise):null}))},
    images:{create:input.imageFileIds.map((fileId,position)=>({fileId,position}))}
  },include:gigInclude});
  await this.db.auditLog.create({data:{actorId:actor.id,action:'GIG_CREATED',resource:'GIG',resourceId:result.id}});
  return result;
 }
 @Patch(':id') async update(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.auth.require(req),input=parse(editSchema,body),gigId=parse(uuid,id);
  const gig=await this.db.gig.findUnique({where:{id:gigId},include:{tailor:true}});
  must(gig&&gig.tailor.ownerId===actor.id,'Gig not found','notfound');
  must(gig.status!=='PUBLISHED','Pause a published gig before modifying it','conflict');
  await this.ownership(actor.id,gig.tailorId,input.categoryId);
  await this.gallery(actor.id,input.imageFileIds);
  return this.db.$transaction(async tx=>{
    await tx.gigPackage.deleteMany({where:{gigId}});
    await tx.gigImage.deleteMany({where:{gigId}});
    return tx.gig.update({where:{id:gigId},data:{
      title:input.title,description:input.description,categoryId:input.categoryId,
      packages:{create:input.packages.map(p=>({...p,pricePaise:BigInt(p.pricePaise),expressPricePaise:p.expressPricePaise?BigInt(p.expressPricePaise):null}))},
      images:{create:input.imageFileIds.map((fileId,position)=>({fileId,position}))}
    },include:gigInclude});
  });
 }
 @Post(':id/publish') async publish(@Req() req:Request,@Param('id') id:string){
  const actor=await this.auth.require(req);
  const gig=await this.db.gig.findUnique({where:{id:parse(uuid,id)},include:{tailor:true,packages:true}});
  must(gig&&gig.tailor.ownerId===actor.id,'Gig not found','notfound');
  must(gig.tailor.status==='APPROVED','Admin must approve your shop first','conflict');
  must(gig.packages.some(p=>p.tier==='BASIC'),'Gig must have a Basic package','conflict');
  const data=await this.db.gig.update({where:{id:gig.id},data:{status:'PUBLISHED'}});
  await this.db.auditLog.create({data:{actorId:actor.id,action:'GIG_PUBLISHED',resource:'GIG',resourceId:gig.id}});
  return data;
 }
 @Post(':id/pause') async pause(@Req() req:Request,@Param('id') id:string){
  const actor=await this.auth.require(req);
  const gig=await this.db.gig.findUnique({where:{id:parse(uuid,id)},include:{tailor:true}});
  must(gig&&gig.tailor.ownerId===actor.id,'Gig not found','notfound');
  const data=await this.db.gig.update({where:{id:gig.id},data:{status:'PAUSED'}});
  await this.db.auditLog.create({data:{actorId:actor.id,action:'GIG_PAUSED',resource:'GIG',resourceId:gig.id}});
  return data;
 }
}