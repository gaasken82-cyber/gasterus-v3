import test from 'node:test';
import assert from 'node:assert/strict';
import { LOTTERY_GAMES, LOTTERY_WIN_PROBABILITY, TOTO_ADVANCED_GAME_RATES, TOTO_STANDARD_RULES, calculateLotteryPricing, evaluateLotterySelection, normalizeLotterySelection } from '../src/lottery-games.js';

const win=(game,selection,result)=>evaluateLotterySelection(game,selection,result);

// Expected value per nominal verge untuk satu baris, dihitung dari seluruh 10.000
// kemungkinan hasil 4D. EV > 1 berarti platform membayar lebih besar dari peluang jp.
const expectedValue=(game,selection,multiplier,gross=100000)=>{
  let total=0;
  for(let n=0;n<10000;n+=1){
    const result=String(n).padStart(4,'0');
    let out;
    try{out=evaluateLotterySelection(game,selection,result);}catch{return null;}
    if(out.won)total+=calculateLotteryPricing(gross,0,multiplier,out.factor).potentialPayout;
  }
  return total/(10000*gross);
};

const SAMPLES={
  STRAIGHT_4D:['4321'],STRAIGHT_3D:['321'],STRAIGHT_2D:['21'],
  POSITION_2D_FRONT:['43'],POSITION_2D_MIDDLE:['32'],
  COLOK_BEBAS:['0','5','9'],
  COLOK_2D:['01','12','89'],
  COLOK_NAGA:['012','345','789'],
  COLOK_JITU:['AS:1','KOP:2','KEPALA:3','EKOR:4'],
  TENGAH_TEPI:['TENGAH','TEPI'],
  DASAR:['KECIL','BESAR','GANJIL','GENAP'],
  SILANG_HOMO:['DEPAN:SILANG','TENGAH:HOMO','BELAKANG:SILANG'],
  KEMBANG_KEMPIS:['DEPAN:KEMBANG','TENGAH:KEMBANG','BELAKANG:KEMBANG','DEPAN:KEMBAR'],
  KOMBINASI:['DEPAN:KECIL:GANJIL','TENGAH:BESAR:GENAP','BELAKANG:KECIL:GENAP']
};

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

test('bolak-balik games menolak angka kembar supaya satu harga berlaku untuk semua pilihan',()=>{
  // "11" punya peluang jp 0,0523 sedangkan "12" punya 0,0974. Kalau keduanya
  // dibayar dengan multiplier yang sama, salah satunya selalu rugi untuk platform.
  assert.throws(()=>normalizeLotterySelection('COLOK_2D','11'),/digit berbeda/i);
  assert.throws(()=>normalizeLotterySelection('COLOK_NAGA','112'),/digit berbeda/i);
  assert.throws(()=>normalizeLotterySelection('COLOK_NAGA','777'),/digit berbeda/i);
  assert.equal(normalizeLotterySelection('COLOK_2D','21'),'12');
  assert.equal(normalizeLotterySelection('COLOK_NAGA','321'),'123');
  // Game berurutan tetap boleh memakai angka kembar.
  assert.equal(normalizeLotterySelection('STRAIGHT_4D','1122'),'1122');
  assert.equal(normalizeLotterySelection('STRAIGHT_3D','111'),'111');
  assert.equal(normalizeLotterySelection('COLOK_BEBAS','5'),'5');
});

test('semua game memiliki minimum bet Rp 100',()=>{
  for(const rule of Object.values(TOTO_STANDARD_RULES))assert.equal(rule.minStake,100);
  for(const rule of Object.values(TOTO_ADVANCED_GAME_RATES))assert.equal(rule.minStake,100);
});

test('EV setiap game di bawah 0,85 dari nominal verge (platform tidak pernah rugi)',()=>{
  const all={...TOTO_STANDARD_RULES,...TOTO_ADVANCED_GAME_RATES};
  for(const [code,rule] of Object.entries(all)){
    const samples=SAMPLES[code];
    assert.ok(samples,`${code} wajib punya sampel uji EV`);
    for(const selection of samples){
      const ev=expectedValue(code,selection,rule.payoutMultiplier);
      assert.notEqual(ev,null,`${code}/${selection} tidak bisa dievaluasi`);
      assert.ok(ev<=0.85,`EV ${code}/${selection} = ${ev.toFixed(3)} melebihi batas 0,85 (multiplier ${rule.payoutMultiplier})`);
    }
  }
});

test('multiplier game lanjutan dikalibrasi dari pilihan yang paling mungkin terjadi',()=>{
  // Batas bawah hanya berlaku untuk game lanjutan yang multiplier-nya kita hitung
  // sendiri. 4D/3D/2D memakai odds produk yang sudah lama (3000x/400x/70x) dengan
  // margin platform yang besar secara sengaja, jadi tidak ikut dinilai di sini.
  // Perbandingan memakai EV tertinggi antar pilihan, karena harga satu game harus
  // menutup pilihan yang paling mungkin jp (mis. KEMBANG, bukan KEMBAR).
  for(const [code,rule] of Object.entries(TOTO_ADVANCED_GAME_RATES)){
    const evs=SAMPLES[code].map(selection=>expectedValue(code,selection,rule.payoutMultiplier));
    const worst=Math.max(...evs);
    assert.ok(worst>=0.4,`EV tertinggi ${code} = ${worst.toFixed(3)} terlalu rendah, multiplier ${rule.payoutMultiplier} tidak masuk akal`);
    assert.ok(worst<=0.85,`EV tertinggi ${code} = ${worst.toFixed(3)} melebihi batas 0,85`);
  }
});

test('multiplier game lanjutan sesuai hasil perhitungan probabilitas settlement',()=>{
  assert.deepEqual(TOTO_ADVANCED_GAME_RATES.COLOK_BEBAS,{discountPercent:5,payoutMultiplier:1.5,minStake:100});
  assert.deepEqual(TOTO_ADVANCED_GAME_RATES.COLOK_2D,{discountPercent:15,payoutMultiplier:7.7,minStake:100});
  assert.deepEqual(TOTO_ADVANCED_GAME_RATES.COLOK_NAGA,{discountPercent:15,payoutMultiplier:36.7,minStake:100});
  assert.deepEqual(TOTO_ADVANCED_GAME_RATES.COLOK_JITU,{discountPercent:5,payoutMultiplier:7.5,minStake:100});
  assert.deepEqual(TOTO_ADVANCED_GAME_RATES.TENGAH_TEPI,{discountPercent:4,payoutMultiplier:1.5,minStake:100});
  assert.deepEqual(TOTO_ADVANCED_GAME_RATES.DASAR,{discountPercent:4,payoutMultiplier:1.3,minStake:100});
  assert.deepEqual(TOTO_ADVANCED_GAME_RATES.SILANG_HOMO,{discountPercent:4,payoutMultiplier:1.5,minStake:100});
  assert.deepEqual(TOTO_ADVANCED_GAME_RATES.KEMBANG_KEMPIS,{discountPercent:4,payoutMultiplier:1.6,minStake:100});
  assert.deepEqual(TOTO_ADVANCED_GAME_RATES.KOMBINASI,{discountPercent:4,payoutMultiplier:3,minStake:100});
});
test('audit EV punya peluang jp untuk setiap game yang punya settlement',()=>{
  for(const game of LOTTERY_GAMES){
    if(!game.engineReady) continue;
    const p=LOTTERY_WIN_PROBABILITY.get(game.code);
    assert.ok(typeof p==='number'&&p>0&&p<=1,`${game.code} belum punya peluang jp yang valid`);
  }
});

test('peluang jp x multiplier tidak pernah melewati batas aman 0,85',()=>{
  // Versi konstanta dari test EV brute force: batas aman bisa dicek tanpa
  // menghitung ulang 10.000 kemungkinan hasil tiap kali test suite jalan.
  const all={...TOTO_STANDARD_RULES,...TOTO_ADVANCED_GAME_RATES};
  for(const [code,rule] of Object.entries(all)){
    const p=LOTTERY_WIN_PROBABILITY.get(code);
    assert.ok(p!==undefined,`${code} tidak punya peluang jp untuk audit EV`);
    assert.ok(p*rule.payoutMultiplier<=0.85,`EV teori ${code} = ${(p*rule.payoutMultiplier).toFixed(3)} melebihi batas 0,85`);
  }
});
