import {z} from 'zod';
export const phoneSchema=z.string().regex(/^\+[1-9]\d{7,14}$/);
export const pincodeSchema=z.string().regex(/^\d{6}$/);
export const addressSchema=z.object({label:z.string().min(1).max(60),name:z.string().min(2).max(120),phone:phoneSchema,line1:z.string().min(5).max(240),line2:z.string().max(240).optional(),city:z.string().min(2),state:z.string().min(2),pincode:pincodeSchema});
export const orderItemSchema=z.object({categoryId:z.string().uuid(),quantity:z.number().int().min(1).max(20),design:z.record(z.unknown()).optional(),material:z.record(z.unknown()).optional(),instructions:z.string().max(2000).optional(),measurementVersionId:z.string().uuid().nullable().optional(),hasFittingSample:z.boolean().default(false),fileIds:z.array(z.string().uuid()).max(12).default([])});
export const createOrderSchema=z.object({tailorId:z.string().uuid(),serviceType:z.enum(['CUSTOM_STITCHING','ALTERATION']),pickupAddressId:z.string().uuid(),returnAddressId:z.string().uuid(),items:z.array(orderItemSchema).min(1).max(10)});
export const quoteLineSchema=z.object({orderItemId:z.string().uuid(),description:z.string().min(3).max(200),quantity:z.number().int().min(1).max(20),unitPricePaise:z.string().regex(/^\d+$/)});
export const createQuoteSchema=z.object({lines:z.array(quoteLineSchema).min(1).max(50),logisticsPaise:z.string().regex(/^\d+$/),taxPaise:z.string().regex(/^\d+$/).default('0'),discountPaise:z.string().regex(/^\d+$/).default('0'),validHours:z.number().int().min(1).max(168).default(48),notes:z.string().max(2000).optional()});
export const loginRequestSchema=z.object({phone:phoneSchema});
export const loginVerifySchema=z.object({phone:phoneSchema,otp:z.string().regex(/^\d{6}$/)});
export type CreateOrder=z.infer<typeof createOrderSchema>;
export type CreateQuote=z.infer<typeof createQuoteSchema>;
export type AddressInput=z.infer<typeof addressSchema>;
export function errorBody(code:string,message:string,requestId?:string){return {error:{code,message,requestId}};}
