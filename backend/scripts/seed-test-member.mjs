#!/usr/bin/env node
// seed-test-member.mjs — buat satu akun member uji lalu isi saldonya lewat ledger
// resmi (bukan UPDATE kolom), jadi saldo di aplikasi sama dengan buku besar.
//
// Dipakai hanya untuk QA manual ketika back office belum bisa menambah saldo.
//   node backend/scripts/seed-test-member.mjs --username qamember01 \
//     --password 'QaTest12345' --balance 2000000
// Butuh DATABASE_URL dan REDIS_URL (salin dari Railway > service > Variables).
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {closeDatabase,query,tx} from '../src/db.js';
import {hashPassword} from '../src/security.js';
import {SYSTEM_ACCOUNTS,ensureSystemAccounts,postTransfer,verifyLedger} from '../src/ledger.js';
import {isValidMemberUsername} from '../src/registration-policy.js';

export function parseArgs(argv=[]){
  const args={username:'',password:'',balance:1_000_000,email:'',resetPassword:false,help:false};
  for(let i=0;i<argv.length;i+=1){const t=argv[i],next=()=>argv[++i];
    if(t==='--username')args.username=String(next()||'').trim();
    else if(t==='--password')args.password=String(next()||'');
    else if(t==='--balance')args.balance=Number(next());
    else if(t==='--email')args.email=String(next()||'').trim().toLowerCase();
    else if(t==='--reset-password')args.resetPassword=true;
    else if(t==='--help'||t==='-h')args.help=true;}
  return args;
}

export function validate({username,password,balance}){
  if(!isValidMemberUsername(username))throw new Error('Username tidak valid untuk policies pendaftaran member.');
  if(String(password||'').length<8)throw new Error('Password minimal 8 karakter (disarankan 12+).');
  if(!Number.isSafeInteger(balance)||balance<0||balance>1_000_000_000)throw new Error('Nominal saldo harus bilangan bulat 0..1.000.000.000.');
  return true;
}

export async function seedTestMember({username,password,balance,email,resetPassword=false}){
  validate({username,password,balance});
  const userId=randomUUID(),accountId=randomUUID(),inviteCode=`QA${userId.slice(0,8).toUpperCase()}`;
  const emailValue=email||`${username}@qa.local`,passwordHash=await hashPassword(password);
  const result=await tx(async client=>{
    await ensureSystemAccounts(client);
    const existing=await client.query('SELECT id FROM users WHERE username=$1 FOR UPDATE',[username]);
    if(existing.rows[0]){
      // Akun sudah ada: password tidak diganti kecuali diminta, cukup pastikan
      // aktif dan sudah menyetujui aturan.
      if(resetPassword)await client.query(`UPDATE users SET password_hash=$1,status='ACTIVE',rules_accepted_at=COALESCE(rules_accepted_at,now()),updated_at=now() WHERE id=$2`,[passwordHash,existing.rows[0].id]);
      else await client.query(`UPDATE users SET status='ACTIVE',rules_accepted_at=COALESCE(rules_accepted_at,now()) WHERE id=$1`,[existing.rows[0].id]);
      await client.query(`INSERT INTO ledger_accounts(id,owner_user_id,account_code,account_type,current_balance) VALUES($1,$2,$3,'MEMBER',0) ON CONFLICT DO NOTHING`,[randomUUID(),existing.rows[0].id,`MEMBER:${existing.rows[0].id}`]);
      await client.query(`INSERT INTO member_referral_profiles(member_id,invite_code) VALUES($1,$2) ON CONFLICT (member_id) DO NOTHING`,[existing.rows[0].id,inviteCode]);
      return {id:existing.rows[0].id,created:false};
    }
    await client.query(`INSERT INTO users(id,username,email,password_hash,referral_code,rules_accepted_at) VALUES($1,$2,$3,$4,$5,now())`,[userId,username,emailValue,passwordHash,inviteCode]);
    await client.query(`INSERT INTO ledger_accounts(id,owner_user_id,account_code,account_type,current_balance) VALUES($1,$2,$3,'MEMBER',0)`,[accountId,userId,`MEMBER:${userId}`]);
    await client.query('INSERT INTO member_referral_profiles(member_id,invite_code) VALUES($1,$2)',[userId,inviteCode]);
    return {id:userId,created:true};
  },{isolation:'SERIALIZABLE'});
  let balanceAfter=null;
  if(balance>0){
    // Kredit lewat ledger resmi supaya books seimbang dan ada jejaknya di audit.
    balanceAfter=await tx(async client=>(await postTransfer(client,{
      memberId:result.id,systemCode:SYSTEM_ACCOUNTS.CLEARING,memberDelta:balance,
      type:'QA_SEED_CREDIT',referenceType:'QA_SEED',referenceId:randomUUID(),
      idempotencyKey:`qa-seed:${result.id}:${Date.now()}`,metadata:{username,reason:'QA manual seed'}
    })).after,{isolation:'SERIALIZABLE'});
  }
  const integrity=await verifyLedger({query});
  return {id:result.id,created:result.created,balance:balanceAfter,ledgerBalanced:Boolean(integrity&&integrity.balanced)};
}

async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(args.help||!args.username){
    console.log('Pakai: node backend/scripts/seed-test-member.mjs --username <user> --password <pw> [--balance 1000000] [--email a@b.c] [--reset-password]');
    await closeDatabase();
    return;
  }
  const outcome=await seedTestMember(args);
  console.log(JSON.stringify({service:'seed-test-member',username:args.username,...outcome},null,2));
  console.log(`\nLogin : https://gasterus.fun/  (username ${args.username})`);
  console.log(`Saldo : ${Number(outcome.balance||0).toLocaleString('id-ID')} IDR`);
  console.log(outcome.ledgerBalanced?'Ledger: seimbang':'Ledger: TIDAK SEIMBANG — jangan dipakai sampai diperiksa');
  console.log('Catatan: akun QA. Hapus setelah pengujian, jangan dipakai member sungguhan.');
  await closeDatabase();
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(async error=>{console.error(`GAGAL: ${error.message}`);try{await closeDatabase();}catch{}process.exit(1);});
}