import { ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { Db } from '../core/db';
import { isProd } from '../core/config';
import { sendOtp } from '../core/otp-delivery';
import { must, sha256 } from '../core/http';
import { loginRequestSchema, loginVerifySchema } from '@stitchmate/contracts';
import { parse } from '../core/http';

const COOKIE='sm_session';
function hashOtp(challengeId:string,otp:string){return createHmac('sha256',process.env.OTP_SECRET!).update(`${challengeId}:${otp}`).digest('hex');}
function eqHash(a:string,b:string){const aa=Buffer.from(a,'hex'),bb=Buffer.from(b,'hex');return aa.length===bb.length && timingSafeEqual(aa,bb);}
export type Actor={id:string;name:string|null;roles:string[];tailorIds:string[]};
@Injectable()
export class AuthService {
  constructor(private readonly db:Db){}
  private deliverOtp(phone:string,otp:string){
    return sendOtp(phone,otp,'LOGIN_OTP');
  }
  async requestOtp(input:unknown){
    const {phone}=parse(loginRequestSchema,input);
    const cutoff=new Date(Date.now()-60*60*1000);
    const existing=await this.db.user.findUnique({where:{phone}});
    if(existing){
      const count=await this.db.otpChallenge.count({where:{userId:existing.id,createdAt:{gte:cutoff}}});
      if(count>=6) throw new HttpException('Too many OTP attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
      const recent=await this.db.otpChallenge.findFirst({where:{userId:existing.id},orderBy:{createdAt:'desc'}});
      if(recent && Date.now()-recent.createdAt.getTime()<60_000) throw new HttpException('Wait before requesting another OTP.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const user=existing??await this.db.user.create({data:{phone,roles:{create:{role:'customer'}}}});
    const id=randomUUID(); const otp=String(randomInt(100000,1000000));
    await this.db.otpChallenge.create({data:{id,userId:user.id,otpHash:hashOtp(id,otp),expiresAt:new Date(Date.now()+5*60_000)}});
    try{await this.deliverOtp(phone,otp);}catch(e){await this.db.otpChallenge.delete({where:{id}});throw e;}
    return {message:'If the number is reachable, a verification code has been sent.',expiresInSeconds:300};
  }
  async verifyOtp(input:unknown,res:Response){
    const {phone,otp}=parse(loginVerifySchema,input);
    const user=await this.db.user.findUnique({where:{phone}});
    must(user,'Invalid or expired OTP','unauthorized');
    const challenge=await this.db.otpChallenge.findFirst({where:{userId:user.id,consumedAt:null,expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'}});
    must(challenge && challenge.attempts<5,'Invalid or expired OTP','unauthorized');
    // Atomically spend an attempt; replay and parallel guesses cannot reset the limit.
    const claimed=await this.db.otpChallenge.updateMany({where:{id:challenge.id,consumedAt:null,attempts:{lt:5}},data:{attempts:{increment:1}}});
    must(claimed.count===1,'Verification attempt rejected','unauthorized');
    if(!eqHash(challenge.otpHash,hashOtp(challenge.id,otp))) throw new UnauthorizedException('Invalid or expired OTP');
    const used=await this.db.otpChallenge.updateMany({where:{id:challenge.id,consumedAt:null},data:{consumedAt:new Date()}});
    must(used.count===1,'OTP already used','unauthorized');
    const token=randomBytes(48).toString('base64url');
    await this.db.session.create({data:{userId:user.id,tokenHash:sha256(token),expiresAt:new Date(Date.now()+7*86400000)}});
    res.cookie(COOKIE,token,{httpOnly:true,secure:isProd,sameSite:'lax',path:'/',maxAge:7*86400000});
    return this.meById(user.id);
  }
  async require(req:Request, roles?:string[]):Promise<Actor>{
    const token=req.cookies?.[COOKIE];
    if(typeof token!=='string'||token.length<40) throw new UnauthorizedException('Sign in required');
    const record=await this.db.session.findUnique({where:{tokenHash:sha256(token)},include:{user:{include:{roles:true}}}});
    if(!record || record.revokedAt || record.expiresAt<=new Date() || record.user.status!=='ACTIVE') throw new UnauthorizedException('Session expired');
    const actor:Actor={id:record.user.id,name:record.user.name,roles:record.user.roles.map(r=>r.role),tailorIds:record.user.roles.filter(r=>r.tailorId).map(r=>r.tailorId!)};
    if(roles && !roles.some(r=>actor.roles.includes(r))) throw new ForbiddenException('Insufficient permissions');
    return actor;
  }
  async logout(req:Request,res:Response){
    const token=req.cookies?.[COOKIE]; if(typeof token==='string') await this.db.session.updateMany({where:{tokenHash:sha256(token)},data:{revokedAt:new Date()}});
    res.clearCookie(COOKIE,{path:'/',secure:isProd,sameSite:'lax'});return {success:true};
  }
  async meById(id:string){const u=await this.db.user.findUniqueOrThrow({where:{id},include:{roles:true}});return {id:u.id,name:u.name,phone:u.phone,roles:u.roles.map(r=>r.role),tailorIds:u.roles.filter(r=>r.tailorId).map(r=>r.tailorId!)};}
}
