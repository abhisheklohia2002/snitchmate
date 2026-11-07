import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { GetObjectCommand, HeadObjectCommand, S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Db } from '../core/db';
import { AuthService } from '../auth/auth.service';
import { parse, must } from '../core/http';

const s3=new S3Client({region:process.env.AWS_REGION??'us-east-1',endpoint:process.env.S3_ENDPOINT||undefined,forcePathStyle:process.env.S3_FORCE_PATH_STYLE==='true',credentials:process.env.S3_ACCESS_KEY_ID&&process.env.S3_SECRET_ACCESS_KEY?{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}:undefined});
const bucket=()=>process.env.S3_BUCKET??'stitchmate-private';
const uploadSchema=z.object({name:z.string().min(1).max(200),mimeType:z.enum(['image/jpeg','image/png','image/webp','application/pdf']),sizeBytes:z.number().int().positive().max(8_000_000),purpose:z.enum(['DESIGN','BEFORE','AFTER','HANDOFF','QC','DOCUMENT'])});
@Controller('uploads')
export class MediaController {
 constructor(private readonly db:Db,private readonly auth:AuthService){}
 @Post('presign') async presign(@Req() req:Request,@Body() body:unknown){
  const actor=await this.auth.require(req);const input=parse(uploadSchema,body);
  const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[input.mimeType];
  const key=`users/${actor.id}/${randomUUID()}.${ext}`;
  const file=await this.db.uploadedFile.create({data:{ownerId:actor.id,storageKey:key,mimeType:input.mimeType,sizeBytes:input.sizeBytes,purpose:input.purpose}});
  const url=await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket(),Key:key,ContentType:input.mimeType,ContentLength:input.sizeBytes}),{expiresIn:180});
  return {fileId:file.id,url,headers:{'Content-Type':input.mimeType},expiresInSeconds:180};
 }
 @Post(':id/complete') async complete(@Req() req:Request,@Param('id') id:string){
  const actor=await this.auth.require(req);const file=await this.db.uploadedFile.findFirst({where:{id,ownerId:actor.id}});must(file,'Upload not found','notfound');
  const head=await s3.send(new HeadObjectCommand({Bucket:bucket(),Key:file.storageKey}));
  must(head.ContentLength===file.sizeBytes && head.ContentType===file.mimeType,'Uploaded file size/type do not match registration');
  await this.db.uploadedFile.update({where:{id},data:{status:'VERIFIED'}});return {fileId:id,status:'VERIFIED'};
 }
 @Get(':id/access') async access(@Req() req:Request,@Param('id') id:string){
  const actor=await this.auth.require(req);
  const file=await this.db.uploadedFile.findUnique({where:{id}});must(file?.status==='VERIFIED','File not available','notfound');
  const allowed=file.ownerId===actor.id||actor.roles.includes('admin')||await this.db.order.findFirst({where:{tailor:{ownerId:actor.id},items:{some:{fileIds:{array_contains:id}}}}});
  must(allowed,'Access denied','forbidden');
  return {url:await getSignedUrl(s3,new GetObjectCommand({Bucket:bucket(),Key:file.storageKey}),{expiresIn:120}),expiresInSeconds:120};
 }
}
