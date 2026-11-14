import { z } from 'zod';

export const aiRequirements=z.object({
 garmentType:z.string().trim().max(90).nullable(),
 serviceType:z.enum(['CUSTOM_STITCHING','ALTERATION']).nullable(),
 occasion:z.string().trim().max(120).nullable(),
 budgetMax:z.number().finite().min(1).max(1000000).nullable(),
 preferredDeliveryDays:z.number().int().min(1).max(90).nullable(),
 pincode:z.string().regex(/^\d{6}$/).nullable(),
 design:z.object({
  neckline:z.string().max(120).nullable(),
  sleeveType:z.string().max(120).nullable(),
  embroidery:z.string().max(160).nullable(),
  color:z.string().max(120).nullable(),
  silhouette:z.string().max(120).nullable()
 }),
 additionalInstructions:z.string().max(1200),
 uncertainty:z.array(z.string().max(180)).max(8),
 missingInformation:z.array(z.string().max(120)).max(8)
});
export type AiRequirements=z.infer<typeof aiRequirements>;
export const emptyRequirements:AiRequirements={
 garmentType:null,serviceType:null,occasion:null,budgetMax:null,preferredDeliveryDays:null,pincode:null,
 design:{neckline:null,sleeveType:null,embroidery:null,color:null,silhouette:null},
 additionalInstructions:'',uncertainty:[],missingInformation:[]
};
export const messageSchema=z.object({
 message:z.string().trim().min(2).max(1600),
 requestId:z.string().uuid(),
 imageFileIds:z.array(z.string().uuid()).max(3).default([])
});
export const briefSchema=z.object({
 garmentType:z.string().trim().min(2).max(90),
 serviceType:z.enum(['CUSTOM_STITCHING','ALTERATION']),
 occasion:z.string().trim().max(120).nullable(),
 budgetMax:z.number().finite().min(1).max(1000000).nullable(),
 preferredDeliveryDays:z.number().int().min(1).max(90).nullable(),
 pincode:z.string().regex(/^\d{6}$/),
 design:aiRequirements.shape.design,
 additionalInstructions:z.string().trim().min(5).max(1200),
 imageFileIds:z.array(z.string().uuid()).max(3),
 gigId:z.string().uuid(),
 gigTier:z.enum(['BASIC','STANDARD','PREMIUM']),
 categoryId:z.string().uuid(),
 tailorId:z.string().uuid()
});
export const modelResultSchema=z.object({
 reply:z.string().trim().min(1).max(1500),
 requirements:aiRequirements
});
export const modelJsonSchema={
 type:'object',additionalProperties:false,
 properties:{
  reply:{type:'string'},
  requirements:{type:'object',additionalProperties:false,
   properties:{
    garmentType:{type:['string','null']},serviceType:{type:['string','null'],enum:['CUSTOM_STITCHING','ALTERATION',null]},
    occasion:{type:['string','null']},budgetMax:{type:['number','null']},
    preferredDeliveryDays:{type:['integer','null']},pincode:{type:['string','null']},
    design:{type:'object',additionalProperties:false,
     properties:Object.fromEntries(['neckline','sleeveType','embroidery','color','silhouette'].map(k=>[k,{type:['string','null']}])) ,
     required:['neckline','sleeveType','embroidery','color','silhouette']},
    additionalInstructions:{type:'string'},uncertainty:{type:'array',items:{type:'string'}},
    missingInformation:{type:'array',items:{type:'string'}}
   },
   required:['garmentType','serviceType','occasion','budgetMax','preferredDeliveryDays','pincode','design','additionalInstructions','uncertainty','missingInformation']
  }
 },
 required:['reply','requirements']
} as const;
