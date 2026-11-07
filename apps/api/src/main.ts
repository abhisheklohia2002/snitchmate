import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestInterceptor, CallHandler, ExecutionContext, Injectable, ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { AppModule } from './module';
import { Observable, map } from 'rxjs';
import cookieParser from 'cookie-parser';
import type { Request, Response } from 'express';
import { cleanBigints } from './core/http';
import { validateConfig, isProd } from './core/config';
import { randomUUID } from 'node:crypto';

@Injectable()
class BigIntSerializer implements NestInterceptor {
 intercept(_ctx:ExecutionContext,next:CallHandler):Observable<unknown>{return next.handle().pipe(map(value=>value===undefined?value:cleanBigints(value)));}
}
@Catch()
class ApiErrors implements ExceptionFilter {
 private readonly logger=new Logger('ApiErrors');
 catch(e:unknown,host:ArgumentsHost){
  const ctx=host.switchToHttp();const res=ctx.getResponse<Response>(),req=ctx.getRequest<Request>();
  const status=e instanceof HttpException?e.getStatus():500;
  const body=e instanceof HttpException?e.getResponse():null;
  // Node fetch usually wraps the transport failure as TypeError('fetch failed').
  // Log only the transport error code, never a provider URL, token or request body.
  const cause: unknown = e instanceof Error ? e.cause : undefined;
  const code = cause && typeof cause === 'object' && 'code' in cause &&
    typeof cause.code === 'string' && /^[A-Z0-9_]{2,40}$/.test(cause.code)
    ? cause.code : undefined;
  if (status >= 500) this.logger.error(`${req.method} ${req.path}: ${e instanceof Error ? e.message : String(e)}${code ? ` [transport=${code}]` : ''}`);
  const message=status===500?'Internal server error':typeof body==='string'?body:typeof body==='object'&&body&&'message' in body?body.message:'Request failed';
  res.status(status).json({error:{code:status===500?'INTERNAL_ERROR':status===401?'UNAUTHORIZED':status===403?'FORBIDDEN':status===404?'NOT_FOUND':'REQUEST_FAILED',message,requestId:res.getHeader('X-Request-Id'),...(typeof body==='object'&&body&&'fields' in body?{fields:body.fields}:{})}});
 }
}
async function bootstrap(){
 validateConfig();
 const app=await NestFactory.create(AppModule,{rawBody:true,bodyParser:true});
 const origin=process.env.WEB_ORIGIN??'http://localhost:3000';
 app.enableCors({origin,credentials:true,methods:['GET','POST','PATCH','PUT','DELETE','OPTIONS']});
 app.setGlobalPrefix('api/v1');
 app.use(cookieParser());
 app.use((req:Request,res:Response,next:()=>void)=>{
  const id=randomUUID();res.setHeader('X-Request-Id',id);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  if(isProd) res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  const changes=['POST','PUT','PATCH','DELETE'].includes(req.method);
  if(changes && !req.path.startsWith('/api/v1/webhooks/')){
    const providedOrigin=req.headers.origin;
    // Non-browser machine clients without an Origin header require a separate auth method.
    if(isProd && providedOrigin!==origin){res.status(403).json({error:{code:'CSRF_ORIGIN',message:'Request origin rejected',requestId:id}});return;}
    if(providedOrigin && providedOrigin!==origin){res.status(403).json({error:{code:'CSRF_ORIGIN',message:'Request origin rejected',requestId:id}});return;}
  }
  next();
 });
 app.useGlobalFilters(new ApiErrors());app.useGlobalInterceptors(new BigIntSerializer());
 await app.listen(Number(process.env.PORT??4000),'0.0.0.0');
 console.info(`StitchMate API listening on port ${process.env.PORT??4000}`);
}
bootstrap().catch(e=>{console.error(e);process.exitCode=1;});
