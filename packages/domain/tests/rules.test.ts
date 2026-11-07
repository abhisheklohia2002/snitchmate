import test from 'node:test';
import assert from 'node:assert/strict';
import {assertTransition, calculateQuote, commissionPaise, isQuoteAcceptable, parsePaise, requiredMaterialReady} from '../src/rules.js';
test('valid forward path and invalid shortcuts',()=>{
 assert.doesNotThrow(()=>assertTransition('DRAFT','QUOTE_REQUESTED'));
 assert.throws(()=>assertTransition('QUOTE_READY','PAID'));
 assert.throws(()=>assertTransition('QUALITY_CHECK','DELIVERED'));
});
test('integer money and commission rounding',()=>{
 const amounts=calculateQuote([{unitPricePaise:150000n,quantity:1},{unitPricePaise:10000n,quantity:2}],14900n,0n,10000n);
 assert.equal(amounts.totalPaise,174900n);
 assert.equal(commissionPaise(amounts.subtotalPaise,1500),25500n);
 assert.equal(parsePaise('14900'),14900n);
 assert.throws(()=>parsePaise(1.2));
 assert.throws(()=>calculateQuote([{unitPricePaise:100n,quantity:1}],0n,0n,200n));
});
test('no acceptance of old or expired quotes',()=>{
 const q={id:'v2',status:'ISSUED',validUntil:new Date('2030-01-01')};
 assert.equal(isQuoteAcceptable(q,'v1'),false);
 assert.equal(isQuoteAcceptable(q,'v2'),true);
 assert.equal(isQuoteAcceptable({...q,validUntil:new Date('2020-01-01')},'v2'),false);
});
test('stitching and alteration require different evidence',()=>{
 const basic={hasMeasurement:false,hasSample:false,hasReference:true,hasBeforePhoto:true,hasInstructions:true};
 assert.equal(requiredMaterialReady('CUSTOM_STITCHING',basic),false);
 assert.equal(requiredMaterialReady('CUSTOM_STITCHING',{...basic,hasSample:true}),true);
 assert.equal(requiredMaterialReady('ALTERATION',basic),true);
});
test('complete delivery cannot bypass receipt and QC',()=>{
 assert.throws(()=>assertTransition('INBOUND_TRANSIT','OUTBOUND_TRANSIT'));
 assert.throws(()=>assertTransition('MATERIAL_RECEIVED','COMPLETED'));
 assert.throws(()=>assertTransition('RETURN_PICKUP_SCHEDULED','DELIVERED'));
 assert.doesNotThrow(()=>assertTransition('OUTBOUND_TRANSIT','DELIVERED'));
});
test('no negative paise or unsafe amounts',()=>{
 assert.throws(()=>parsePaise('-1'));
 assert.throws(()=>parsePaise(Number.MAX_SAFE_INTEGER+1));
 assert.throws(()=>parsePaise('1.2'));
 assert.equal(parsePaise(0),0n);
});
test('commission basis points rounding and boundary',()=>{
 assert.equal(commissionPaise(100n,1500),15n);
 assert.equal(commissionPaise(1n,5000),1n);
 assert.throws(()=>commissionPaise(100n,10001));
});
test('rework transitions require real supervised stages',()=>{
 assert.doesNotThrow(()=>assertTransition('DISPUTED','REWORK_APPROVED'));
 assert.doesNotThrow(()=>assertTransition('REWORK_APPROVED','REWORK_IN_PROGRESS'));
 assert.doesNotThrow(()=>assertTransition('REWORK_IN_PROGRESS','QUALITY_CHECK'));
 assert.throws(()=>assertTransition('REWORK_APPROVED','COMPLETED'));
});
