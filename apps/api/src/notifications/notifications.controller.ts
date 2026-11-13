import {Body,Controller,Get,Param,Patch,Query,Req,Res} from '@nestjs/common';
import type {Request,Response} from 'express';
import {z} from 'zod';
import {Db} from '../core/db';
import {AuthService} from '../auth/auth.service';
import {must,parse} from '../core/http';

const pageSchema=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(30).default(15)});
const uuid=z.string().uuid();
const safeNotificationSelect={id:true,kind:true,title:true,body:true,href:true,createdAt:true,readAt:true} as const;

@Controller('notifications')
export class NotificationsController {
 constructor(private readonly db:Db,private readonly auth:AuthService){}
 @Get() async list(@Req() req:Request,@Query() query:unknown){
  const actor=await this.auth.require(req);
  const {page,limit}=parse(pageSchema,query);
  const where={userId:actor.id};
  const [items,total,unreadCount]=await Promise.all([
   this.db.inAppNotification.findMany({where,select:safeNotificationSelect,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*limit,take:limit}),
   this.db.inAppNotification.count({where}),
   this.db.inAppNotification.count({where:{userId:actor.id,readAt:null}})
  ]);
  return {items,total,unreadCount,page,pageSize:limit};
 }
 @Get('unread-count') async count(@Req() req:Request){
  const actor=await this.auth.require(req);
  return {unreadCount:await this.db.inAppNotification.count({where:{userId:actor.id,readAt:null}})};
 }
 @Patch('read-all') async readAll(@Req() req:Request){
  const actor=await this.auth.require(req);
  const result=await this.db.inAppNotification.updateMany({where:{userId:actor.id,readAt:null},data:{readAt:new Date()}});
  return {updated:result.count};
 }
 @Patch(':id/read') async read(@Req() req:Request,@Param('id') id:string){
  const actor=await this.auth.require(req);
  const result=await this.db.inAppNotification.updateMany({where:{userId:actor.id,id:parse(uuid,id),readAt:null},data:{readAt:new Date()}});
  if(!result.count)must(!!await this.db.inAppNotification.findFirst({where:{userId:actor.id,id},select:{id:true}}),'Notification not found','notfound');
  return {success:true};
 }
 @Get('stream') async stream(@Req() req:Request,@Res() res:Response) {
  const actor=await this.auth.require(req);
  res.setHeader('Content-Type','text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control','no-cache, no-transform, private');
  res.setHeader('Connection','keep-alive');
  res.setHeader('X-Accel-Buffering','no');
  res.flushHeaders();
  res.write(': StitchMate notification stream\n\n');
  // SSE is only active while a signed-in client is connected. No Redis or
  // extra Render worker is required. Client refetches paginated inbox via HTTP.
  let active=true;
  let lastDate=new Date();
  let lastId='';
  let checking=false;
  const poll=async()=>{
   if(!active||checking)return;
   checking=true;
   try {
    const session=await this.auth.require(req).catch(()=>null);
    if(!session||session.id!==actor.id){res.end();active=false;return;}
    const notifications=await this.db.inAppNotification.findMany({
      where:{userId:actor.id,OR:[{createdAt:{gt:lastDate}},{createdAt:lastDate,id:{gt:lastId||'00000000-0000-0000-0000-000000000000'}}]},
      orderBy:[{createdAt:'asc'},{id:'asc'}],take:100,select:{id:true,createdAt:true}
    });
    for(const notification of notifications){
     if(!active)break;
     lastDate=notification.createdAt;
     lastId=notification.id;
     res.write('id: '+notification.id+'\nevent: notification\ndata: '+JSON.stringify({id:notification.id})+'\n\n');
    }
    if(!notifications.length&&active)res.write(': heartbeat\n\n');
   }catch{if(active)res.write('event: retry\ndata: {}\n\n');}
   finally{checking=false;}
  };
  const timer=setInterval(()=>{void poll();},9000);
  res.on('close',()=>{active=false;clearInterval(timer);});
 }
}