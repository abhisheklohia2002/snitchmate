import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {verifyWebhookHmac}=require('../dist/core/security.js');
const {calculateQuote,canTransition,isQuoteAcceptable}=require('@stitchmate/domain');
const {createOrderSchema,createQuoteSchema}=require('@stitchmate/contracts');

test('valid payment event HMAC and altered body rejection',()=>{
 const secret='test-secret';const bytes=Buffer.from('{"event":"payment.captured"}');const signature=createHmac('sha256',secret).update(bytes).digest('hex');
 assert.equal(verifyWebhookHmac(secret,bytes,signature),true);
 assert.equal(verifyWebhookHmac(secret,Buffer.from('{"event":"payment.failed"}'),signature),false);
 assert.equal(verifyWebhookHmac(secret,bytes,'not hex'),false);
 assert.equal(verifyWebhookHmac(secret,bytes,undefined),false);
});
test('stale quote cannot be accepted',()=>{
 const q={id:'latest',status:'ISSUED',validUntil:new Date('2031-01-01')};
 assert.equal(isQuoteAcceptable(q,'prior'),false);
 assert.equal(isQuoteAcceptable({...q,status:'SUPERSEDED'},'latest'),false);
});
test('invalid production/payment shortcut prohibited',()=>{
 assert.equal(canTransition('DRAFT','PAID'),false);
 assert.equal(canTransition('IN_PRODUCTION','DELIVERED'),false);
 assert.equal(canTransition('RETURN_PICKUP_SCHEDULED','DELIVERED'),false);
});
test('invalid money and empty quote lines rejected',()=>{
 assert.throws(()=>calculateQuote([],0n,0n,0n));
 assert.throws(()=>calculateQuote([{unitPricePaise:100n,quantity:1}],0n,0n,200n));
});
test('order and quote API contracts reject malformed input',()=>{
 assert.equal(createOrderSchema.safeParse({tailorId:'bad',serviceType:'ALTERATION',items:[]}).success,false);
 assert.equal(createQuoteSchema.safeParse({lines:[],logisticsPaise:'149.99'}).success,false);
});
