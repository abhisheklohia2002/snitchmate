import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {buildTwilioWhatsAppRequest,sendTwilioWhatsApp,validateTwilioConfig}=require('../dist/twilio-whatsapp.js');
const env={
  TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),
  TWILIO_AUTH_TOKEN:'never-real-secret',
  TWILIO_WHATSAPP_FROM:'whatsapp:+14155238886',
  TWILIO_CONTENT_SID_QUOTE_READY:'HX'+'1'.repeat(32),
  TWILIO_CONTENT_SID_PAYMENT_CAPTURED:'HX'+'2'.repeat(32),
  TWILIO_CONTENT_SID_ORDER_COMPLETED:'HX'+'3'.repeat(32),
  TWILIO_CONTENT_SID_STATUS_UPDATE:'HX'+'4'.repeat(32)
};
test('Twilio approved template request uses ContentSid, never Body, and destination is WhatsApp',()=>{
 validateTwilioConfig(env);
 const {url,init}=buildTwilioWhatsAppRequest('+919876543210','order.quote_ready','SM-20261107-ABCD1234',undefined,env);
 assert.match(url,/api\.twilio\.com\/2010-04-01\/Accounts\/AC/);
 const form=new URLSearchParams(init.body);
 assert.equal(form.get('To'),'whatsapp:+919876543210');
 assert.equal(form.get('ContentSid'),env.TWILIO_CONTENT_SID_QUOTE_READY);
 assert.equal(form.has('Body'),false);
 assert.deepEqual(JSON.parse(form.get('ContentVariables')),{'1':'SM-20261107-ABCD1234'});
});
test('status update template fills safe status variable',()=>{
 const {init}=buildTwilioWhatsAppRequest('+919876543210','order.status_changed','SM-20261107-ABCD1234','IN_PRODUCTION',env);
 const vars=JSON.parse(new URLSearchParams(init.body).get('ContentVariables'));
 assert.deepEqual(vars,{'1':'SM-20261107-ABCD1234','2':'In production'});
});
test('Twilio rejects bad sender or content Sid before any request',()=>{
 assert.throws(()=>buildTwilioWhatsAppRequest('+919876543210','order.completed','SM-20261107-ABCD1234',undefined,{...env,TWILIO_CONTENT_SID_ORDER_COMPLETED:''}));
 assert.throws(()=>buildTwilioWhatsAppRequest('1234','order.completed','SM-20261107-ABCD1234',undefined,env));
});
test('Twilio rejects HTTP failure, requires an acknowledged message Sid',async()=>{
 await assert.rejects(sendTwilioWhatsApp('+919876543210','order.completed','SM-20261107-ABCD1234',undefined,{env,fetcher:async()=>new Response('Not authorized',{status:401})}),/failed/);
 await assert.rejects(sendTwilioWhatsApp('+919876543210','order.completed','SM-20261107-ABCD1234',undefined,{env,fetcher:async()=>new Response('{}',{status:201})}),/acknowledge/);
 const sid=await sendTwilioWhatsApp('+919876543210','order.completed','SM-20261107-ABCD1234',undefined,{env,fetcher:async()=>new Response(JSON.stringify({sid:'SM'+'a'.repeat(32)}),{status:201})});
 assert.equal(sid,'SM'+'a'.repeat(32));
});
