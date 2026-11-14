import { Body, Controller, Get, Param, Patch, Post, Query, Req, Sse } from '@nestjs/common';
import type { Request } from 'express';
import { timer,concatMap,from,map,catchError,of } from 'rxjs';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service';
import { parse } from '../core/http';
import { NotificationsService } from './notifications.service';
const idSchema=z.string().uuid();
@Controller('notifications')
export class NotificationsController{
 constructor(private readonly auth:AuthService,private readonly notifications:NotificationsService){}
 @Get() async list(@Req() req:Request,@Query('limit') limit?:string,@Query('cursor') cursor?:string){
  const actor=await this.auth.require(req);
  const size=limit?parse(z.coerce.number().int().min(1).max(50),limit):20;
  return this.notifications.list(actor,size,cursor?parse(idSchema,cursor):undefined);
 }
 @Get('state') async state(@Req() req:Request){return this.notifications.snapshot(await this.auth.require(req));}
 @Sse('stream') async stream(@Req() req:Request){
  const actor=await this.auth.require(req);
  // The session is validated before connecting. Each cycle checks whether it is still active.
  return timer(0,25000).pipe(concatMap(()=>from(this.auth.require(req).then(a=>this.notifications.snapshot(a))).pipe(
    map(value=>({data:value})),
    catchError(()=>of({data:{error:'SESSION_EXPIRED'}}))
  )));
 }
 @Patch('read-all') async readAll(@Req() req:Request){return this.notifications.markAllRead(await this.auth.require(req));}
 @Patch(':id/read') async read(@Req() req:Request,@Param('id') id:string){return this.notifications.markRead(await this.auth.require(req),parse(idSchema,id));}
 @Get('preferences') async preferences(@Req() req:Request){return this.notifications.preference(await this.auth.require(req));}
 @Patch('preferences') async setPreferences(@Req() req:Request,@Body() body:unknown){
  const input=parse(z.object({soundEnabled:z.boolean()}),body);
  return this.notifications.setPreference(await this.auth.require(req),input.soundEnabled);
 }
}