import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import type { Request } from 'express';
import { Db } from '../core/db';
import { AuthService } from '../auth/auth.service';
import { parse, must } from '../core/http';
import { addressSchema, pincodeSchema } from '@stitchmate/contracts';

const tailorSchema=z.object({shopName:z.string().trim().min(3).max(90),description:z.string().max(1500),pincode:pincodeSchema,address:z.string().min(8).max(255),turnaroundDays:z.number().int().min(1).max(45).default(7)});
const serviceSchema=z.object({categoryId:z.string().uuid(),basePricePaise:z.string().regex(/^[1-9]\d{0,12}$/),minDays:z.number().int().min(1).max(60).default(3),maxDays:z.number().int().min(1).max(60).default(7),active:z.boolean().default(true)});
const measurementSchema=z.object({label:z.string().min(2).max(90),forPerson:z.string().min(2).max(90),method:z.enum(['SELF','PROFESSIONAL','SAMPLE']).default('SELF'),values:z.record(z.union([z.number().positive().max(400),z.string().max(120)])),unit:z.enum(['CM','IN']).default('CM')});
const uuid=z.string().uuid();
const locationSchema=z.object({latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180)});
function distanceKm(lat1:number,lng1:number,lat2:number,lng2:number):number {
  const r=Math.PI/180, dLat=(lat2-lat1)*r,dLng=(lng2-lng1)*r;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dLng/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

@Controller()
export class MarketplaceController {
 constructor(private readonly db:Db,private readonly auth:AuthService){}
 @Get('health') health(){return {ok:true,service:'stitchmate-api'};}
 @Get('services') services(@Query('type') type?:string){return this.db.serviceCategory.findMany({where:{active:true,...(type?{serviceType:type}:{})},orderBy:{title:'asc'}});}
 @Get('service-zones/check') async zone(@Query('pincode') code:string){const pincode=parse(pincodeSchema,code);const zone=await this.db.serviceZone.findUnique({where:{pincode}});return {pincode,serviceable:!!zone?.active,deliveryFeePaise:zone?.active?(zone.pickupFeePaise+zone.returnFeePaise):null};}
 @Get('tailors') async tailors(
  @Query('pincode') code?:string,@Query('categoryId') categoryId?:string,@Query('page') pageString?:string,
  @Query('lat') latString?:string,@Query('lng') lngString?:string,@Query('radiusKm') radiusString?:string
 ) {
  const pincode=code?parse(pincodeSchema,code):undefined;
  const page=Math.max(1,Math.min(10000,Number.parseInt(pageString??'1',10)||1));
  must((latString===undefined)===(lngString===undefined),'Latitude and longitude must be provided together');
  const location=latString!==undefined?parse(locationSchema,{
   latitude:Number(latString),longitude:Number(lngString)
  }):null;
  const radius=radiusString===undefined?7:Number(radiusString);
  must(Number.isFinite(radius)&&radius>=1&&radius<=30,'Search radius must be 1 to 30 km');
  const where={status:'APPROVED',...(pincode?{zones:{some:{pincode,active:true}}}:{}),
   ...(categoryId?{services:{some:{categoryId:parse(uuid,categoryId),active:true}}}:{})};
  const select={id:true,slug:true,shopName:true,description:true,pincode:true,turnaroundDays:true,
   latitude:true,longitude:true,locationVerifiedAt:true,
   services:{where:{active:true},include:{category:true}},
   portfolio:{where:{approved:true,permission:true},select:{id:true,fileId:true,caption:true,category:true},take:4}} as const;
  if(!location){
   const [total,items]=await Promise.all([
    this.db.tailor.count({where}),
    this.db.tailor.findMany({where,select,skip:(page-1)*12,take:12,orderBy:{verifiedAt:'desc'}})
   ]);
   return {items:items.map(t=>({...t,latitude:t.locationVerifiedAt?t.latitude:null,longitude:t.locationVerifiedAt?t.longitude:null,locationVerifiedAt:undefined})),total,page,pageSize:12};
  }
  // Pilot-sized result set. In production move radial search to PostGIS / a geo index.
  const candidates=await this.db.tailor.findMany({where,select,take:500,orderBy:{verifiedAt:'desc'}});
  const nearby=candidates.flatMap(t=>{
   if(!t.locationVerifiedAt||t.latitude===null||t.longitude===null)return [];
   const km=distanceKm(location.latitude,location.longitude,t.latitude,t.longitude);
   return km<=radius?[{...t,locationVerifiedAt:undefined,distanceKm:Math.round(km*10)/10}]:[];
  }).sort((a,b)=>a.distanceKm-b.distanceKm);
  return {items:nearby.slice((page-1)*12,page*12),total:nearby.length,page,pageSize:12,radiusKm:radius};
 }
 @Get('tailors/id/:id') async tailorById(@Param('id') id:string){
  const tailor=await this.db.tailor.findUnique({where:{id:parse(uuid,id)},include:{services:{where:{active:true},include:{category:true}},zones:{where:{active:true}}}});
  must(tailor?.status==='APPROVED','Tailor unavailable','notfound');
  return {id:tailor.id,slug:tailor.slug,shopName:tailor.shopName,description:tailor.description,pincode:tailor.pincode,latitude:tailor.locationVerifiedAt?tailor.latitude:null,longitude:tailor.locationVerifiedAt?tailor.longitude:null,turnaroundDays:tailor.turnaroundDays,services:tailor.services,zones:tailor.zones.map(z=>z.pincode)};
 }
 @Get('tailors/:slug') async tailor(@Param('slug') slug:string){const tailor=await this.db.tailor.findUnique({where:{slug},include:{services:{where:{active:true},include:{category:true}},portfolio:{where:{approved:true,permission:true}},zones:{where:{active:true}}}});must(tailor?.status==='APPROVED','Tailor not found','notfound');return {id:tailor.id,shopName:tailor.shopName,slug:tailor.slug,description:tailor.description,pincode:tailor.pincode,latitude:tailor.locationVerifiedAt?tailor.latitude:null,longitude:tailor.locationVerifiedAt?tailor.longitude:null,turnaroundDays:tailor.turnaroundDays,services:tailor.services,portfolio:tailor.portfolio,zones:tailor.zones.map(z=>z.pincode)};}
 @Get('me/whatsapp-preferences') async whatsAppPreferences(@Req() req:Request){
  const actor=await this.auth.require(req);
  const user=await this.db.user.findUniqueOrThrow({where:{id:actor.id},select:{whatsappNotificationsOptInAt:true}});
  return {enabled:!!user.whatsappNotificationsOptInAt};
 }
 @Post('me/whatsapp-preferences') async setWhatsAppPreferences(@Req() req:Request,@Body() body:unknown){
  const actor=await this.auth.require(req);
  const input=parse(z.object({enabled:z.boolean()}),body);
  const user=await this.db.user.update({where:{id:actor.id},data:{whatsappNotificationsOptInAt:input.enabled?new Date():null}});
  await this.db.auditLog.create({data:{actorId:actor.id,action:input.enabled?'WHATSAPP_OPT_IN':'WHATSAPP_OPT_OUT',resource:'USER',resourceId:actor.id}});
  return {enabled:!!user.whatsappNotificationsOptInAt};
 }
 @Get('me/addresses') async addresses(@Req() req:Request){const actor=await this.auth.require(req);return this.db.address.findMany({where:{userId:actor.id},orderBy:{createdAt:'desc'}});}
 @Post('me/addresses') async createAddress(@Req() req:Request,@Body() body:unknown){const actor=await this.auth.require(req);const input=parse(addressSchema,body);must(await this.db.serviceZone.findFirst({where:{pincode:input.pincode,active:true}}),'Address is outside current service zones');return this.db.address.create({data:{userId:actor.id,...input}});}
 @Patch('me/addresses/:id') async editAddress(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){const actor=await this.auth.require(req);const data=parse(addressSchema.partial(),body);if(data.pincode)must(await this.db.serviceZone.findFirst({where:{pincode:data.pincode,active:true}}),'Outside service area');const r=await this.db.address.updateMany({where:{id:parse(uuid,id),userId:actor.id},data});must(r.count===1,'Address not found','notfound');return {success:true};}
 @Delete('me/addresses/:id') async deleteAddress(@Req() req:Request,@Param('id') id:string){const actor=await this.auth.require(req);const target=parse(uuid,id);must(await this.db.address.findFirst({where:{id:target,userId:actor.id}}),'Address not found','notfound');const inUse=await this.db.order.count({where:{OR:[{pickupAddressId:target},{returnAddressId:target}]}});must(inUse===0,'Address is attached to an order; it must be retained','conflict');await this.db.address.delete({where:{id:target}});return {success:true};}
 @Get('me/measurements') async measurements(@Req() req:Request){const actor=await this.auth.require(req);return this.db.measurementProfile.findMany({where:{userId:actor.id},include:{versions:{orderBy:{version:'desc'},take:1}},orderBy:{createdAt:'desc'}});}
 @Post('me/measurements') async createMeasurements(@Req() req:Request,@Body() body:unknown){const actor=await this.auth.require(req);const input=parse(measurementSchema,body);return this.db.measurementProfile.create({data:{userId:actor.id,label:input.label,forPerson:input.forPerson,method:input.method,versions:{create:{version:1,values:input.values,unit:input.unit}}},include:{versions:true}});}
 @Post('me/measurements/:id/versions') async newMeasurements(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){const actor=await this.auth.require(req);const input=parse(measurementSchema.pick({values:true,unit:true}),body);const profile=await this.db.measurementProfile.findFirst({where:{id:parse(uuid,id),userId:actor.id}});must(profile,'Profile not found','notfound');return this.db.$transaction(async(tx)=>{const top=await tx.measurementVersion.findFirst({where:{profileId:profile.id},orderBy:{version:'desc'}});return tx.measurementVersion.create({data:{profileId:profile.id,version:(top?.version??0)+1,values:input.values,unit:input.unit}});});}
 @Get('tailor/me') async myTailors(@Req() req:Request){const actor=await this.auth.require(req);return this.db.tailor.findMany({where:{ownerId:actor.id},include:{services:{include:{category:true}},zones:true}});}
 @Post('tailor/onboarding') async onboarding(@Req() req:Request,@Body() body:unknown){const actor=await this.auth.require(req);const input=parse(tailorSchema,body);must(await this.db.serviceZone.findFirst({where:{pincode:input.pincode,active:true}}),'This pincode is not in pilot area');const slug=`${input.shopName.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}-${Math.random().toString(36).slice(2,7)}`;return this.db.tailor.create({data:{ownerId:actor.id,slug,...input,zones:{create:{pincode:input.pincode}}}});}
 @Post('tailor/me/:tailorId/location-request') async submitWorkshopLocation(@Req() req:Request,@Param('tailorId') tailorId:string,@Body() body:unknown){
  const actor=await this.auth.require(req);
  const input=parse(locationSchema,body);
  must(!(input.latitude===0 && input.longitude===0),'Choose your workshop location, not the default map origin');
  const tailor=await this.db.tailor.findFirst({where:{id:parse(uuid,tailorId),ownerId:actor.id}});
  must(tailor,'Tailor account not found','forbidden');
  must(tailor.status!=='SUSPENDED','Suspended shops cannot submit map locations','conflict');
  const submittedAt=new Date();
  await this.db.$transaction(async tx=>{
   await tx.tailor.update({where:{id:tailor.id},data:{pendingLatitude:input.latitude,pendingLongitude:input.longitude,locationSubmittedAt:submittedAt}});
   await tx.auditLog.create({data:{actorId:actor.id,action:'TAILOR_LOCATION_REQUESTED',resource:'TAILOR',resourceId:tailor.id,
    context:{latitude:input.latitude,longitude:input.longitude}}});
  });
  return {status:'PENDING_VERIFICATION',submittedAt};
 }
 @Post('tailor/me/:tailorId/services') async addService(@Req() req:Request,@Param('tailorId') tailorId:string,@Body() body:unknown){const actor=await this.auth.require(req);const input=parse(serviceSchema,body);const tailor=await this.db.tailor.findFirst({where:{id:parse(uuid,tailorId),ownerId:actor.id}});must(tailor,'Tailor account not found','forbidden');const minDays=input.minDays??3;const maxDays=input.maxDays??7;must(maxDays>=minDays,'Maximum days must be >= minimum days');must(await this.db.serviceCategory.findFirst({where:{id:input.categoryId,active:true}}),'Unknown category');return this.db.tailorService.upsert({where:{tailorId_categoryId:{tailorId:tailor.id,categoryId:input.categoryId}},create:{tailorId:tailor.id,categoryId:input.categoryId,basePricePaise:BigInt(input.basePricePaise),minDays,maxDays,active:input.active??true},update:{basePricePaise:BigInt(input.basePricePaise),minDays,maxDays,active:input.active??true}});}
 @Get('admin/couriers') async couriers(@Req() req:Request){await this.auth.require(req,['admin']);return this.db.user.findMany({where:{roles:{some:{role:'courier'}}},select:{id:true,name:true,phone:true},take:100,orderBy:{createdAt:'desc'}});}
 @Get('admin/tailors') async adminTailors(@Req() req:Request){await this.auth.require(req,['admin']);return this.db.tailor.findMany({include:{services:{include:{category:true}},owner:{select:{name:true,phone:true}}},orderBy:{createdAt:'desc'},take:100});}
 @Post('admin/tailors/:id/approve') async approve(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){const actor=await this.auth.require(req,['admin']);const input=parse(z.object({verificationNotes:z.string().min(10).max(1000)}),body);const tailor=await this.db.tailor.findUnique({where:{id:parse(uuid,id)},include:{services:true}});must(tailor,'Tailor not found','notfound');must(tailor.services.length>0,'Tailor must list a service before approval');must(tailor.status==='PENDING','Already reviewed','conflict');return this.db.$transaction(async tx=>{await tx.tailor.update({where:{id},data:{status:'APPROVED',verifiedAt:new Date()}});await tx.userRole.create({data:{userId:tailor.ownerId,role:'tailor_owner',tailorId:id}});await tx.auditLog.create({data:{actorId:actor.id,action:'TAILOR_APPROVED',resource:'TAILOR',resourceId:id,context:{verificationNotes:input.verificationNotes}}});return {success:true};});}
 // Workshop map pins are supplied and verified by operations, never inferred from pincodes.
 @Post('admin/tailors/:id/location') async setVerifiedLocation(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.auth.require(req,['admin']);
  const input=parse(locationSchema,body);
  const tailor=await this.db.tailor.findUnique({where:{id:parse(uuid,id)}});
  must(tailor?.status==='APPROVED','Only approved workshops can appear on the map','conflict');
  return this.db.$transaction(async tx=>{
   await tx.tailor.update({where:{id:tailor.id},data:{latitude:input.latitude,longitude:input.longitude,locationVerifiedAt:new Date(),pendingLatitude:null,pendingLongitude:null,locationSubmittedAt:null}});
   await tx.auditLog.create({data:{actorId:actor.id,action:'TAILOR_LOCATION_VERIFIED',resource:'TAILOR',resourceId:tailor.id,
    context:{latitude:input.latitude,longitude:input.longitude}}});
   return {success:true};
  });
 }
 @Post('admin/tailors/:id/location/approve') async approveWorkshopLocation(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.auth.require(req,['admin']);
  const input=parse(z.object({verificationNotes:z.string().trim().min(10).max(1000)}),body);
  const tailor=await this.db.tailor.findUnique({where:{id:parse(uuid,id)}});
  must(tailor?.status==='APPROVED','Approve the shop before publishing its map pin','conflict');
  must(tailor.locationSubmittedAt!==null && tailor.pendingLatitude!==null && tailor.pendingLongitude!==null,'No pending location request','conflict');
  await this.db.$transaction(async tx=>{
   const changed=await tx.tailor.updateMany({where:{id:tailor.id,locationSubmittedAt:tailor.locationSubmittedAt},data:{
    latitude:tailor.pendingLatitude,longitude:tailor.pendingLongitude,locationVerifiedAt:new Date(),
    pendingLatitude:null,pendingLongitude:null,locationSubmittedAt:null
   }});
   must(changed.count===1,'Location changed during review. Refresh and retry','conflict');
   await tx.auditLog.create({data:{actorId:actor.id,action:'TAILOR_LOCATION_VERIFIED',resource:'TAILOR',resourceId:tailor.id,
    context:{latitude:tailor.pendingLatitude,longitude:tailor.pendingLongitude,verificationNotes:input.verificationNotes,submittedBy:'TAILOR'}}});
  });
  return {success:true};
 }
 @Post('admin/tailors/:id/location/reject') async rejectWorkshopLocation(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
  const actor=await this.auth.require(req,['admin']);
  const input=parse(z.object({reason:z.string().trim().min(10).max(1000)}),body);
  const tailor=await this.db.tailor.findUnique({where:{id:parse(uuid,id)}});
  must(tailor,'Tailor not found','notfound');
  must(tailor.locationSubmittedAt!==null && tailor.pendingLatitude!==null && tailor.pendingLongitude!==null,'No pending location request','conflict');
  await this.db.$transaction(async tx=>{
   const changed=await tx.tailor.updateMany({where:{id:tailor.id,locationSubmittedAt:tailor.locationSubmittedAt},data:{
    pendingLatitude:null,pendingLongitude:null,locationSubmittedAt:null
   }});
   must(changed.count===1,'Location changed during review. Refresh and retry','conflict');
   await tx.auditLog.create({data:{actorId:actor.id,action:'TAILOR_LOCATION_REJECTED',resource:'TAILOR',resourceId:tailor.id,context:input}});
  });
  return {success:true};
 }
 @Post('admin/tailors/:id/suspend') async suspend(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){const actor=await this.auth.require(req,['admin']);const input=parse(z.object({reason:z.string().min(10)}),body);await this.db.$transaction(async tx=>{await tx.tailor.update({where:{id:parse(uuid,id)},data:{status:'SUSPENDED'}});await tx.auditLog.create({data:{actorId:actor.id,action:'TAILOR_SUSPENDED',resource:'TAILOR',resourceId:id,context:input}});});return {success:true};}
}
