import { Injectable } from '@nestjs/common';
import { Db } from '../../core/db';
import type { AiRequirements } from '../schemas/requirements';

const aliases:Record<string,string[]>={
 BLOUSE:['blouse','choli'],MENS_SHIRT:['shirt'],MENS_TROUSERS:['trouser','pant','pants'],
 KURTA_PAJAMA:['kurta','pajama','pyjama'],WOMENS_SUIT:['suit','salwar'],
 DRESS:['dress','gown'],HEM:['jeans','hem','shorten','length','trouser','pant','dress'],
 WAIST:['waist','fitting','tight','loose'],SLEEVE:['sleeve'],ZIPPER:['zip','zipper'],REPAIR:['repair','patch']
};
export type GigMatch={
 id:string;slug:string;title:string;description:string;categoryId:string;serviceType:string;
 tailor:{id:string;shopName:string;slug:string};
 packages:{tier:string;title:string;pricePaise:string;deliveryDays:number;revisions:number}[];
 rating:number|null;reviewCount:number;
};
@Injectable()
export class MatchingService {
 constructor(private readonly db:Db){}
 async find(requirements:AiRequirements):Promise<GigMatch[]>{
  if(!requirements.pincode||!requirements.garmentType||!requirements.serviceType)return [];
  const query=requirements.garmentType.toLowerCase().trim();
  const categoryCodes=Object.entries(aliases).filter(([_,words])=>words.some(word=>query.includes(word)||word.includes(query))).map(([code])=>code);
  // No guessy LLM ranking: unknown garment must not silently match unrelated categories.
  if(!categoryCodes.length)return [];
  const categories=await this.db.serviceCategory.findMany({where:{code:{in:categoryCodes},serviceType:requirements.serviceType,active:true},select:{id:true}});
  if(!categories.length)return [];
  const records=await this.db.gig.findMany({
   where:{status:'PUBLISHED',categoryId:{in:categories.map(c=>c.id)},tailor:{status:'APPROVED',zones:{some:{pincode:requirements.pincode,active:true}},services:{some:{categoryId:{in:categories.map(c=>c.id)},active:true}}}},
   include:{
    tailor:{select:{id:true,shopName:true,slug:true}},
    category:{select:{serviceType:true}},
    packages:{orderBy:{pricePaise:'asc'},select:{tier:true,title:true,pricePaise:true,deliveryDays:true,revisions:true}},
    orders:{where:{review:{isNot:null}},select:{review:{select:{score:true}}},take:50}
   },
   take:80,orderBy:{createdAt:'desc'}
  });
  const matches=records.flatMap(g=>{
   const packages=g.packages.filter(p=>
    (requirements.budgetMax===null||p.pricePaise<=BigInt(Math.floor(requirements.budgetMax*100)))&&
    (requirements.preferredDeliveryDays===null||p.deliveryDays<=requirements.preferredDeliveryDays)
   );
   if(!packages.length)return [];
   const reviews=g.orders.flatMap(o=>o.review?[o.review.score]:[]);
   return [{id:g.id,slug:g.slug,title:g.title,description:g.description.slice(0,350),categoryId:g.categoryId,serviceType:g.category.serviceType,
    tailor:g.tailor,packages:packages.map(p=>({...p,pricePaise:p.pricePaise.toString()})),
    rating:reviews.length?Math.round(reviews.reduce((a,b)=>a+b,0)/reviews.length*10)/10:null,
    reviewCount:reviews.length
   }];
  });
  return matches.sort((a,b)=>Number(BigInt(a.packages[0]!.pricePaise)-BigInt(b.packages[0]!.pricePaise))).slice(0,8);
 }
}
