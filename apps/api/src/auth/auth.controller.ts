import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
@Controller('auth')
export class AuthController {
 constructor(private readonly auth:AuthService){}
 @Post('otp/request') request(@Body() input:unknown){return this.auth.requestOtp(input);}
 @Post('otp/verify') verify(@Body() input:unknown,@Res({passthrough:true}) res:Response){return this.auth.verifyOtp(input,res);}
 @Post('logout') logout(@Req() req:Request,@Res({passthrough:true}) res:Response){return this.auth.logout(req,res);}
 @Get('me') async me(@Req() req:Request){const actor=await this.auth.require(req);return this.auth.meById(actor.id);}
}
