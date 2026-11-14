import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { AiService } from './ai.service';
import { MatchingService } from './services/matching.service';
import { parse } from '../core/http';
import { briefSchema, messageSchema, aiRequirements } from './schemas/requirements';

@Controller('ai')
export class AiController {
 constructor(private readonly auth:AuthService,private readonly ai:AiService,private readonly matching:MatchingService){}
 @Get('config') async config(@Req() req:Request){await this.auth.require(req);return this.ai.configuration();}
 @Post('matches') async matches(@Req() req:Request,@Body() body:unknown){await this.auth.require(req);return this.matching.find(parse(aiRequirements,body));}
 @Get('conversations') async list(@Req() req:Request){return this.ai.list(await this.auth.require(req));}
 @Post('conversations') async create(@Req() req:Request){return this.ai.create(await this.auth.require(req));}
 @Get('conversations/:id') async get(@Req() req:Request,@Param('id') id:string){return this.ai.get(await this.auth.require(req),id);}
 @Post('conversations/:id/messages') async chat(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
  return this.ai.speak(await this.auth.require(req),id,parse(messageSchema,body));
 }
 @Post('conversations/:id/confirm') async confirm(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){
  return this.ai.confirm(await this.auth.require(req),id,parse(briefSchema,body));
 }
 @Get('conversations/:id/booking') async booking(@Req() req:Request,@Param('id') id:string){
  return this.ai.booking(await this.auth.require(req),id);
 }
}
