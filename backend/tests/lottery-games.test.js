import test from 'node:test';
import assert from 'node:assert/strict';
import { TOTO_STANDARD_RULES, calculateLotteryPricing, evaluateLotterySelection, normalizeLotterySelection } from '../src/lottery-games.js';

const win=(game,selection,result)=>evaluateLotterySelection(game,selection,result);

test('straight and positional games evaluate exact draw positions',()=>{
  assert.equal(win('STRAIGHT_4D','4321','4321').won,true);
  assert.equal(win('STRAIGHT_3D','321','4321').won,true);
  assert.equal(win('STRAIGHT_2D','21','4321').won,true);
  assert.equal(win('POSITION_2D_FRONT','43','4321').won,true);
  assert.equal(win('POSITION_2D_MIDDLE','32','4321').won,true);
});

test('colok games normalize selections and evaluate occurrence rules',()=>{
  assert.equal(win('COLOK_BEBAS','3','4331').factor,2);
  assert.equal(normalizeLotterySelection('COLOK_2D','42'),'24');
  assert.equal(win('COLOK_2D','24','4321').won,true);
  assert.equal(win('COLOK_NAGA','123','4321').won,true);
  assert.equal(win('COLOK_JITU','AS:4','4321').won,true);
  assert.equal(win('COLOK_JITU','EKOR:4','4321').won,false);
});

test('classification games follow deterministic result rules',()=>{
  assert.equal(win('TENGAH_TEPI','TEPI','6789').won,true);
  assert.equal(win('DASAR','BESAR','1234').won,true);
  assert.equal(win('DASAR','GANJIL','1234').won,true);
  assert.equal(win('SILANG_HOMO','DEPAN:SILANG','4321').won,true);
  assert.equal(win('SILANG_HOMO','DEPAN:HOMO','7704').won,true);
  assert.equal(win('KEMBANG_KEMPIS','DEPAN:KEMPIS','4321').won,true);
  assert.equal(win('KEMBANG_KEMPIS','TENGAH:KEMBANG','4236').won,true);
  assert.equal(win('KEMBANG_KEMPIS','BELAKANG:KEMBAR','4099').won,true);
  assert.equal(win('KOMBINASI','DEPAN:KECIL:GENAP','1845').won,true);
});

test('shio evaluator uses configured 1-12 result index without inventing animal labels',()=>{
  assert.equal(win('SHIO','9','4321').won,true);
  assert.equal(win('SHIO','10','4321').won,false);
});


test('standard TOTO discounts, prizes and minimum BET match product rules',()=>{
  assert.deepEqual(TOTO_STANDARD_RULES.STRAIGHT_4D,{discountPercent:66,payoutMultiplier:3000,minStake:100});
  assert.deepEqual(TOTO_STANDARD_RULES.STRAIGHT_3D,{discountPercent:59,payoutMultiplier:400,minStake:100});
  assert.deepEqual(TOTO_STANDARD_RULES.STRAIGHT_2D,{discountPercent:29,payoutMultiplier:70,minStake:100});
  assert.deepEqual(TOTO_STANDARD_RULES.POSITION_2D_FRONT,{discountPercent:28,payoutMultiplier:65,minStake:100});
  assert.deepEqual(TOTO_STANDARD_RULES.POSITION_2D_MIDDLE,{discountPercent:28,payoutMultiplier:65,minStake:100});
});

test('discount changes balance debit but prize remains gross BET multiplied by prize index',()=>{
  assert.deepEqual(calculateLotteryPricing(100000,66,3000),{gross:100000,discount:66,stake:34000,potentialPayout:300000000});
  assert.deepEqual(calculateLotteryPricing(100000,59,400),{gross:100000,discount:59,stake:41000,potentialPayout:40000000});
  assert.deepEqual(calculateLotteryPricing(100000,29,70),{gross:100000,discount:29,stake:71000,potentialPayout:7000000});
  assert.deepEqual(calculateLotteryPricing(100000,28,65),{gross:100000,discount:28,stake:72000,potentialPayout:6500000});
});
