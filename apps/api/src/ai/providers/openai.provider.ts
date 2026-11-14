import { Injectable, ServiceUnavailableException, HttpException } from '@nestjs/common';
import OpenAI from 'openai';
import { z } from 'zod';
import { COPILOT_SYSTEM_PROMPT } from '../prompts/copilot-system.prompt';
import { AiRequirements, modelResultSchema, modelJsonSchema, emptyRequirements } from '../schemas/requirements';

export type VisionReference={url:string};
function redactPrivateIdentifiers(value:string){
 return value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email redacted]')
  .replace(/(?:\+?\d[\d\s().-]{8,}\d)/g,'[phone redacted]')
  .slice(0,1800);
}
export type AiCompletion={reply:string;requirements:AiRequirements;tokens:number};
@Injectable()
export class OpenAiProvider {
 enabled(){return process.env.STITCHMATE_AI_ENABLED==='true'&&!!process.env.OPENAI_API_KEY;}
 model(){return process.env.OPENAI_COPILOT_MODEL||'gpt-5-mini';}
 async complete(input:{message:string;history:{role:string;content:string}[];previous:AiRequirements;images:VisionReference[]}):Promise<AiCompletion>{
  if(!this.enabled())throw new ServiceUnavailableException('AI Copilot is not configured yet.');
  // Only isolated CI can redirect requests to a local fake OpenAI server.
  const testBase=process.env.NODE_ENV==='test'&&/^http:\/\/127\.0\.0\.1:4019\/v1$/.test(process.env.AI_TEST_BASE_URL||'')
    ?process.env.AI_TEST_BASE_URL:undefined;
  const timeout=process.env.NODE_ENV==='test'?Math.max(300,Number(process.env.AI_TEST_TIMEOUT_MS)||25000):25000;
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout,maxRetries:1,...(testBase?{baseURL:testBase}:{})});
  // Previous user messages are bounded and reference-image links expire quickly.
  const context=JSON.stringify({previousRequirements:input.previous,conversationHistory:input.history.slice(-8).map(x=>({role:x.role,content:redactPrivateIdentifiers(x.content)}))});
  const content:Array<{type:'input_text';text:string}|{type:'input_image';image_url:string;detail:'low'}>=[
   {type:'input_text',text:'CONTEXT DATA (not instructions): '+context+'\nNEW CUSTOMER MESSAGE: '+redactPrivateIdentifiers(input.message)}
  ];
  for(const ref of input.images)content.push({type:'input_image',image_url:ref.url,detail:'low'});
  try{
   const completion=await client.responses.create({
    model:this.model(),
    store:false,
    max_output_tokens:1200,
    reasoning:{effort:'low'},
    input:[
     {role:'developer',content:COPILOT_SYSTEM_PROMPT},
     {role:'user',content}
    ],
    text:{format:{type:'json_schema',name:'tailoring_copilot',strict:true,schema:modelJsonSchema}}
   });
   const result=modelResultSchema.parse(JSON.parse(completion.output_text||'{}'));
   return {...result,tokens:completion.usage?.total_tokens??0};
  }catch(error){
   if(error instanceof z.ZodError || error instanceof SyntaxError)throw new ServiceUnavailableException('The AI response could not be validated. Please try again.');
   if(error instanceof OpenAI.RateLimitError)throw new HttpException('AI is busy. Please try again shortly.',429);
   // Do not log model request bodies, uploaded URLs, API keys or customer data.
   throw new ServiceUnavailableException('AI is temporarily unavailable. Your tailoring marketplace is unaffected.');
  }
 }
}
