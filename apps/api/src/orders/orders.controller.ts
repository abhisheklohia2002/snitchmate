import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { OrdersService } from './orders.service';
import { AuthService } from '../auth/auth.service';
@Controller('orders')
export class OrdersController {
 constructor(private readonly orders:OrdersService,private readonly auth:AuthService){}
 @Get() async list(@Req() req:Request){return this.orders.list(await this.auth.require(req));}
 @Post() async create(@Req() req:Request,@Body() body:unknown){return this.orders.create(await this.auth.require(req),body);}
 @Get(':id') async detail(@Req() req:Request,@Param('id') id:string){return this.orders.visible(id,await this.auth.require(req));}
 @Get(':id/timeline') async timeline(@Req() req:Request,@Param('id') id:string){return this.orders.timeline(await this.auth.require(req),id);}
 @Post(':id/request-quote') async requestQuote(@Req() req:Request,@Param('id') id:string){return this.orders.requestQuote(await this.auth.require(req),id);}
 @Post(':id/quotes/:quoteId/accept') async acceptQuote(@Req() req:Request,@Param('id') id:string,@Param('quoteId') quoteId:string){return this.orders.acceptQuote(await this.auth.require(req),id,quoteId);}
 @Post(':id/cancel') async cancel(@Req() req:Request,@Param('id') id:string){return this.orders.cancel(await this.auth.require(req),id);}
 @Post(':id/confirm-delivery') async confirm(@Req() req:Request,@Param('id') id:string){return this.orders.confirmDelivery(await this.auth.require(req),id);}
 @Post(':id/correction-requests') async correction(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){return this.orders.correction(await this.auth.require(req),id,body);}
 @Post(':id/reviews') async review(@Req() req:Request,@Param('id') id:string,@Body() body:unknown){return this.orders.review(await this.auth.require(req),id,body);}
}
