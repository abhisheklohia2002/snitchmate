import { createHmac, timingSafeEqual } from 'node:crypto';
/** Constant-time verification of lowercase/uppercase hex HMAC signatures. */
export function verifyWebhookHmac(secret:string,bytes:Buffer,signature:string|undefined):boolean{
 if(!secret||!signature||!/^([a-fA-F0-9]{2}){32}$/.test(signature))return false;
 const expected=Buffer.from(createHmac('sha256',secret).update(bytes).digest('hex'),'hex');
 const actual=Buffer.from(signature,'hex');
 return actual.length===expected.length && timingSafeEqual(actual,expected);
}
