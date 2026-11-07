import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ZodSchema, ZodError } from 'zod';
import type { Request } from 'express';

export function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  try { return schema.parse(value); }
  catch (e) { if(e instanceof ZodError) throw new BadRequestException({ code:'INVALID_INPUT', fields:e.flatten() }); throw e; }
}
export function must(condition: unknown, message: string, kind:'bad'|'forbidden'|'notfound'|'conflict'|'unauthorized'='bad'): asserts condition {
  if(condition) return;
  switch(kind){
    case 'forbidden': throw new ForbiddenException(message);
    case 'notfound': throw new NotFoundException(message);
    case 'conflict': throw new ConflictException(message);
    case 'unauthorized': throw new UnauthorizedException(message);
    default: throw new BadRequestException(message);
  }
}
export function sha256(s:string){return createHash('sha256').update(s).digest('hex');}
export function orderNumber(){return `SM-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomUUID().slice(0,8).toUpperCase()}`;}
export function requestId(req: Request) { return typeof req.headers['x-request-id']==='string' ? req.headers['x-request-id'] : randomUUID(); }
export const STATUS_CANCELLED = new Set(['CANCELLED','COMPLETED','TAILOR_DECLINED']);
export function cleanBigints<T>(input:T):T {return JSON.parse(JSON.stringify(input,(_key,value)=>typeof value==='bigint'?value.toString():value));}
export function safeError(e:unknown){return e instanceof HttpException ? e : new HttpException('Internal server error',500);}
