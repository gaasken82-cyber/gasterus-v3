import { AppError } from './errors.js';

const POSITIONS=['DEPAN','TENGAH','BELAKANG'];
const JITU_POSITIONS=['AS','KOP','KEPALA','EKOR'];
const SIZE=['KECIL','BESAR'];
const PARITY=['GANJIL','GENAP'];

export const LOTTERY_GAMES=Object.freeze([
  {code:'STRAIGHT_4D',label:'4D',group:'Angka',baseType:'4D',uiMode:'digits',inputDigits:4,engineReady:true,defaultEnabled:true,description:'Tepat 4 digit hasil.'},
  {code:'STRAIGHT_3D',label:'3D',group:'Angka',baseType:'3D',uiMode:'digits',inputDigits:3,engineReady:true,defaultEnabled:true,description:'Tepat 3 digit terakhir.'},
  {code:'STRAIGHT_2D',label:'2D Belakang',group:'Angka',baseType:'2D',uiMode:'digits',inputDigits:2,engineReady:true,defaultEnabled:true,description:'Tepat 2 digit terakhir.'},
  {code:'POSITION_2D_FRONT',label:'2D Depan',group:'Posisi',baseType:'2D',uiMode:'digits',inputDigits:2,engineReady:true,defaultEnabled:true,description:'Tepat 2 digit depan (AB) dari hasil 4D.'},
  {code:'POSITION_2D_MIDDLE',label:'2D Tengah',group:'Posisi',baseType:'2D',uiMode:'digits',inputDigits:2,engineReady:true,defaultEnabled:true,description:'Tepat 2 digit tengah (BC) dari hasil 4D.'},
  {code:'COLOK_BEBAS',label:'Colok Bebas',group:'Colok',baseType:'4D',uiMode:'digits',inputDigits:1,maxPayoutFactor:4,engineReady:true,defaultEnabled:false,description:'Satu digit boleh muncul di posisi mana saja.'},
  {code:'COLOK_2D',label:'Colok Bebas 2D',group:'Colok',baseType:'4D',uiMode:'digits',inputDigits:2,engineReady:true,defaultEnabled:false,unordered:true,description:'Dua digit harus muncul pada hasil, posisi bebas.'},
  {code:'COLOK_NAGA',label:'Colok Naga',group:'Colok',baseType:'4D',uiMode:'digits',inputDigits:3,engineReady:true,defaultEnabled:false,unordered:true,description:'Tiga digit harus muncul pada hasil, posisi bebas.'},
  {code:'COLOK_JITU',label:'Colok Jitu',group:'Colok',baseType:'4D',uiMode:'jitu',inputDigits:1,engineReady:true,defaultEnabled:false,positions:JITU_POSITIONS,description:'Satu digit pada posisi AS/KOP/KEPALA/EKOR.'},
  {code:'TENGAH_TEPI',label:'Tengah / Tepi',group:'50-50',baseType:'2D',uiMode:'choice',engineReady:true,defaultEnabled:false,choices:['TENGAH','TEPI'],description:'2D 25–74 = Tengah; 00–24 atau 75–99 = Tepi.'},
  {code:'DASAR',label:'Dasar',group:'50-50',baseType:'2D',uiMode:'choice',engineReady:true,defaultEnabled:false,choices:['KECIL','BESAR','GANJIL','GENAP'],description:'Digital root jumlah dua digit belakang dinilai kecil/besar atau ganjil/genap.'},
  {code:'SILANG_HOMO',label:'Silang / Homo',group:'Pola',baseType:'4D',uiMode:'positionChoice',engineReady:true,defaultEnabled:false,positions:POSITIONS,choices:['SILANG','HOMO'],description:'Bandingkan paritas sepasang digit pada posisi Depan/Tengah/Belakang.'},
  {code:'KEMBANG_KEMPIS',label:'Kembang / Kempis / Kembar',group:'Pola',baseType:'4D',uiMode:'positionChoice',engineReady:true,defaultEnabled:false,positions:POSITIONS,choices:['KEMBANG','KEMPIS','KEMBAR'],description:'Bandingkan nilai dua digit pada posisi Depan/Tengah/Belakang.'},
  {code:'KOMBINASI',label:'Kombinasi',group:'Pola',baseType:'4D',uiMode:'combination',engineReady:true,defaultEnabled:false,positions:POSITIONS,sizes:SIZE,parities:PARITY,description:'Kombinasi kecil/besar digit pertama dan ganjil/genap digit kedua pada pasangan posisi.'},
  {code:'SHIO',label:'Shio',group:'Shio',baseType:'2D',uiMode:'shio',engineReady:true,defaultEnabled:false,requiresOptions:true,description:'Menggunakan indeks 1–12; label hewan harus dikonfigurasi untuk periode/tahun yang berlaku.'},
  {code:'MACAU_SHIO',label:'Macau Shio',group:'Shio',baseType:'4D',uiMode:'unsupported',engineReady:false,defaultEnabled:false,description:'Tidak diaktifkan tanpa kontrak aturan settlement provider.'},
  {code:'FIFTY_GENERAL',label:'50-50',group:'50-50',baseType:'2D',uiMode:'unsupported',engineReady:false,defaultEnabled:false,description:'Tidak diaktifkan sampai definisi market/kei dan posisi dikonfigurasi eksplisit.'}
]);

export const LOTTERY_GAME_MAP=new Map(LOTTERY_GAMES.map(game=>[game.code,game]));

export const TOTO_STANDARD_RULES=Object.freeze({
  STRAIGHT_4D:Object.freeze({discountPercent:66,payoutMultiplier:3000,minStake:100}),
  STRAIGHT_3D:Object.freeze({discountPercent:59,payoutMultiplier:400,minStake:100}),
  STRAIGHT_2D:Object.freeze({discountPercent:29,payoutMultiplier:70,minStake:100}),
  POSITION_2D_FRONT:Object.freeze({discountPercent:28,payoutMultiplier:65,minStake:100}),
  POSITION_2D_MIDDLE:Object.freeze({discountPercent:28,payoutMultiplier:65,minStake:100})
});

// Rates game lanjutan (colok / pola / 50-50). Angka ini BUKAN diambil dari daftar
// commercially, tapi dihitung dari probabilitas hasil seragam 0000-9999 memakai
// evaluateLotterySelection di bawah, dengan syarat:
//
//   EV = P(win) x E[factor] x payoutMultiplier  <=  0.75 dari nominal verge
//
// (payout selalu dihitung dari nominal verge, bukan dari stake setelah diskon —
// lihat calculateLotteryPricing.) Perhitungan aktual, brute force 10.000 hasil:
//
//   COLOK_BEBAS     E[factor]=0.4972  -> 1.5    EV 0.746
//   COLOK_2D        P=0.0974          -> 7.7    EV 0.750
//   COLOK_NAGA      P=0.0204          -> 36.7   EV 0.749
//   COLOK_JITU      P=0.1000          -> 7.5    EV 0.750
//   TENGAH_TEPI     P=0.5000          -> 1.5    EV 0.750
//   DASAR           P=0.5500 (maks)   -> 1.3    EV 0.715
//   SILANG_HOMO     P=0.5000          -> 1.5    EV 0.750
//   KEMBANG_KEMPIS  P=0.4500 (maks)   -> 1.6    EV 0.720
//   KOMBINASI       P=0.2500          -> 3.0    EV 0.750
//
// Nilai lama (COLOK_BEBAS 7, COLOK_2D 70, COLOK_NAGA 350, COLOK_JITU 65,
// TENGAH_TEPI 2, DASAR 2, SILANG_HOMO 3, KEMBANG_KEMPIS 3) menghasilkan EV
// 1.0 sampai 7.1, artinya platform membayar jauh lebih besar dari peluang
// jp-nya. Test lottery-games.test.js mengunci batas EV 0.85 supaya angka ini
// tidak pernah dinaikkan tanpa implementasi settlement yang baru.
export const TOTO_ADVANCED_GAME_RATES=Object.freeze({
  COLOK_BEBAS:Object.freeze({discountPercent:5,payoutMultiplier:1.5,minStake:100}),
  COLOK_2D:Object.freeze({discountPercent:15,payoutMultiplier:7.7,minStake:100}),
  COLOK_NAGA:Object.freeze({discountPercent:15,payoutMultiplier:36.7,minStake:100}),
  COLOK_JITU:Object.freeze({discountPercent:5,payoutMultiplier:7.5,minStake:100}),
  TENGAH_TEPI:Object.freeze({discountPercent:4,payoutMultiplier:1.5,minStake:100}),
  DASAR:Object.freeze({discountPercent:4,payoutMultiplier:1.3,minStake:100}),
  SILANG_HOMO:Object.freeze({discountPercent:4,payoutMultiplier:1.5,minStake:100}),
  KEMBANG_KEMPIS:Object.freeze({discountPercent:4,payoutMultiplier:1.6,minStake:100}),
  KOMBINASI:Object.freeze({discountPercent:4,payoutMultiplier:3,minStake:100})
});

export function calculateLotteryPricing(amount,discountPercent,payoutMultiplier,factor=1){
  const gross=Number(amount),discount=Number(discountPercent),multiplier=Number(payoutMultiplier),winFactor=Number(factor||1);
  const stake=Math.max(1,Math.round(gross*(1-discount/100)));
  const potentialPayout=Math.round(gross*multiplier*winFactor);
  return {gross,discount,stake,potentialPayout};
}


const clean=v=>String(v??'').trim().toUpperCase();
const requireGame=code=>{const game=LOTTERY_GAME_MAP.get(clean(code));if(!game)throw new AppError(400,'Jenis permainan tidak dikenal.','LOTTERY_GAME_UNKNOWN');return game;};
const ensureChoice=(value,allowed,label='pilihan')=>{const v=clean(value);if(!allowed.includes(v))throw new AppError(400,`${label} tidak valid.`,'LOTTERY_SELECTION_INVALID');return v;};

export function normalizeLotterySelection(gameCode,rawSelection){
  const game=requireGame(gameCode);
  if(!game.engineReady)throw new AppError(409,'Permainan belum memiliki kontrak settlement yang aktif.','LOTTERY_GAME_NOT_READY');
  const raw=clean(rawSelection);
  if(game.uiMode==='digits'){
    if(!new RegExp(`^\\d{${game.inputDigits}}$`).test(raw))throw new AppError(400,`Pilihan ${game.label} harus ${game.inputDigits} digit.`,'LOTTERY_SELECTION_INVALID');
    // Game bolak-balik (urut bebas) hanya boleh memakai digit berbeda. Angka kembar
    // seperti "11" untuk COLOK_2D punya peluang jp 0.0523, bukan 0.0974 seperti "12",
    // sehingga satu harga multiplier tidak bisa menutup keduanya dan platform membayar
    // 7.7x untuk pilihan yang peluang jp-nya lebih kecil. Menolak kembar membuat satu
    // harga berlaku untuk semua pilihan.
    if(game.unordered&&new Set(raw).size!==raw.length)throw new AppError(400,`${game.label} memakai digit berbeda (contoh: 1 dan 2), bukan angka kembar.`,'LOTTERY_SELECTION_INVALID');
    return game.unordered?raw.split('').sort().join(''):raw;
  }
  if(game.uiMode==='jitu'){
    const [position,digit,...extra]=raw.split(':');
    if(extra.length||!JITU_POSITIONS.includes(position)||!/^[0-9]$/.test(digit||''))throw new AppError(400,'Colok Jitu harus berformat POSISI:DIGIT.','LOTTERY_SELECTION_INVALID');
    return `${position}:${digit}`;
  }
  if(game.uiMode==='choice')return ensureChoice(raw,game.choices);
  if(game.uiMode==='positionChoice'){
    const [position,choice,...extra]=raw.split(':');
    if(extra.length||!game.positions.includes(position)||!game.choices.includes(choice))throw new AppError(400,'Pilihan posisi/pola tidak valid.','LOTTERY_SELECTION_INVALID');
    return `${position}:${choice}`;
  }
  if(game.uiMode==='combination'){
    const [position,size,parity,...extra]=raw.split(':');
    if(extra.length||!POSITIONS.includes(position)||!SIZE.includes(size)||!PARITY.includes(parity))throw new AppError(400,'Pilihan kombinasi tidak valid.','LOTTERY_SELECTION_INVALID');
    return `${position}:${size}:${parity}`;
  }
  if(game.uiMode==='shio'){
    const index=Number(raw);
    if(!Number.isInteger(index)||index<1||index>12)throw new AppError(400,'Indeks Shio harus 1 sampai 12.','LOTTERY_SELECTION_INVALID');
    return String(index);
  }
  throw new AppError(409,'Permainan belum dapat menerima taruhan.','LOTTERY_GAME_NOT_READY');
}

const result4=result=>{
  const value=String(result??'').trim();
  if(!/^\d{4,6}$/.test(value))throw new AppError(422,'Hasil tidak kompatibel dengan engine permainan angka.','LOTTERY_RESULT_INCOMPATIBLE');
  return value.slice(-4);
};
const pairFor=(position,r4)=>position==='DEPAN'?r4.slice(0,2):position==='TENGAH'?r4.slice(1,3):r4.slice(2,4);
const multisetContains=(resultDigits,selectionDigits)=>{
  const counts={};for(const d of resultDigits)counts[d]=(counts[d]||0)+1;
  for(const d of selectionDigits){if(!counts[d])return false;counts[d]-=1;}return true;
};
const digitalRoot=n=>{let v=Math.abs(Number(n)||0);while(v>9)v=String(v).split('').reduce((a,d)=>a+Number(d),0);return v;};
const sizeOf=n=>Number(n)<=4?'KECIL':'BESAR';
const parityOf=n=>Number(n)%2?'GANJIL':'GENAP';

export function evaluateLotterySelection(gameCode,rawSelection,result){
  const game=requireGame(gameCode);const selection=normalizeLotterySelection(game.code,rawSelection);const full=String(result??'').trim();
  if(!/^\d{2,6}$/.test(full))throw new AppError(422,'Format hasil tidak kompatibel.','LOTTERY_RESULT_INCOMPATIBLE');
  if(game.code==='STRAIGHT_4D')return {won:selection===full.slice(-4),factor:1};
  if(game.code==='STRAIGHT_3D')return {won:selection===full.slice(-3),factor:1};
  if(game.code==='STRAIGHT_2D')return {won:selection===full.slice(-2),factor:1};
  const r4=result4(full);
  if(game.code==='POSITION_2D_FRONT')return {won:selection===r4.slice(0,2),factor:1};
  if(game.code==='POSITION_2D_MIDDLE')return {won:selection===r4.slice(1,3),factor:1};
  if(game.code==='COLOK_BEBAS'){
    const occurrences=[...r4].filter(d=>d===selection).length;return {won:occurrences>0,factor:Math.max(1,occurrences)};
  }
  if(game.code==='COLOK_2D'||game.code==='COLOK_NAGA')return {won:multisetContains(r4,selection),factor:1};
  if(game.code==='COLOK_JITU'){
    const [position,digit]=selection.split(':');const index={AS:0,KOP:1,KEPALA:2,EKOR:3}[position];return {won:r4[index]===digit,factor:1};
  }
  if(game.code==='TENGAH_TEPI'){
    const n=Number(r4.slice(-2));const actual=n>=25&&n<=74?'TENGAH':'TEPI';return {won:selection===actual,factor:1};
  }
  if(game.code==='DASAR'){
    const root=digitalRoot(Number(r4[2])+Number(r4[3]));const actual=new Set([sizeOf(root),parityOf(root)]);return {won:actual.has(selection),factor:1};
  }
  if(game.code==='SILANG_HOMO'){
    const [position,choice]=selection.split(':');const pair=pairFor(position,r4);const actual=parityOf(pair[0])===parityOf(pair[1])?'HOMO':'SILANG';return {won:choice===actual,factor:1};
  }
  if(game.code==='KEMBANG_KEMPIS'){
    const [position,choice]=selection.split(':');const pair=pairFor(position,r4);const a=Number(pair[0]),b=Number(pair[1]);const actual=a===b?'KEMBAR':a<b?'KEMBANG':'KEMPIS';return {won:choice===actual,factor:1};
  }
  if(game.code==='KOMBINASI'){
    const [position,size,parity]=selection.split(':');const pair=pairFor(position,r4);return {won:sizeOf(pair[0])===size&&parityOf(pair[1])===parity,factor:1};
  }
  if(game.code==='SHIO'){
    const n=Number(r4.slice(-2));const index=n%12===0?12:n%12;return {won:Number(selection)===index,factor:1};
  }
  throw new AppError(409,'Settlement permainan belum tersedia.','LOTTERY_GAME_NOT_READY');
}

export function legacyGameCode(type){const t=clean(type);return t==='4D'?'STRAIGHT_4D':t==='3D'?'STRAIGHT_3D':'STRAIGHT_2D';}
export function publicGameDefinition(game){return {code:game.code,label:game.label,group:game.group,baseType:game.baseType,uiMode:game.uiMode,inputDigits:game.inputDigits||null,positions:game.positions||null,choices:game.choices||null,sizes:game.sizes||null,parities:game.parities||null,engineReady:game.engineReady,maxPayoutFactor:game.maxPayoutFactor||1,description:game.description};}
