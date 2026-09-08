import { randomUUID, createHash } from 'node:crypto';
import { query, tx } from './db.js';
import { assert } from './errors.js';
import { requirePermission } from './auth.js';
import { audit } from './audit.js';
import { postTransfer, SYSTEM_ACCOUNTS, verifyLedger } from './ledger.js';
import { createMemberNotification } from './notifications.js';

export const MONEY_CURRENCY='IDR';
export const fingerprintWalletRequest=({requestType,amount,paymentMethodId=null,referenceNumber=null,payoutSnapshot=null})=>createHash('sha256').update(JSON.stringify({requestType:String(requestType||'').toUpperCase(),amount:Number(amount),paymentMethodId:paymentMethodId||null,referenceNumber:referenceNumber||null,payoutSnapshot:payoutSnapshot||null})).digest('hex');

export async function recordMoneyEvent(client,{walletRequestId,memberId,eventType,amount,currency=MONEY_CURRENCY,actorId=null,metadata={}}){
  await client.query(`INSERT INTO money_transaction_events(id,wallet_request_id,member_id,event_type,amount,currency,actor_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[randomUUID(),walletRequestId,memberId,eventType,amount,currency,actorId,JSON.stringify(metadata||{})]);
}


export async function expireStaleWalletApprovals(limit=50){
  return tx(async client=>{
    const {rows}=await client.query(`SELECT a.*,w.member_id,w.amount,w.currency,w.request_type,w.funds_state,w.status wallet_status
      FROM approval_requests a JOIN wallet_requests w ON w.id=(a.payload->>'walletRequestId')::uuid
      WHERE a.action_type='HIGH_VALUE_WALLET' AND a.status='PENDING' AND a.expires_at<=now() AND w.status='AWAITING_SECOND_APPROVAL'
      ORDER BY a.expires_at LIMIT $1 FOR UPDATE OF a,w SKIP LOCKED`,[limit]);
    for(const row of rows){
      let balanceAfter=null;
      if(row.request_type==='WITHDRAW'&&row.funds_state==='RESERVED'){
        const ledger=await postTransfer(client,{memberId:row.member_id,systemCode:SYSTEM_ACCOUNTS.WITHDRAW_HOLD,memberDelta:Number(row.amount),type:'WALLET_WITHDRAW_RELEASED',referenceType:'WALLET_REQUEST',referenceId:row.payload.walletRequestId,idempotencyKey:`wallet-release:${row.payload.walletRequestId}`,metadata:{reason:'SECOND_APPROVAL_EXPIRED'},actorId:null});balanceAfter=ledger.after;
      }
      await client.query(`UPDATE approval_requests SET status='EXPIRED',reason='Second approval expired',updated_at=now() WHERE id=$1`,[row.id]);
      await client.query(`UPDATE wallet_requests SET status='CANCELLED',funds_state=CASE WHEN request_type='WITHDRAW' AND funds_state='RESERVED' THEN 'RELEASED' ELSE funds_state END,rejection_reason='Second approval expired',released_at=CASE WHEN request_type='WITHDRAW' THEN COALESCE(released_at,now()) ELSE released_at END,updated_at=now() WHERE id=$1`,[row.payload.walletRequestId]);
      await recordMoneyEvent(client,{walletRequestId:row.payload.walletRequestId,memberId:row.member_id,eventType:'SECOND_APPROVAL_EXPIRED',amount:Number(row.amount),currency:row.currency||MONEY_CURRENCY,metadata:{approvalId:row.id,balanceAfter}});
      await createMemberNotification(client,{memberId:row.member_id,type:'SYSTEM',title:'Pengajuan Kedaluwarsa',message:`Pengajuan ${String(row.request_type).toLowerCase()} sebesar IDR ${Number(row.amount).toLocaleString('id-ID')} dibatalkan karena persetujuan kedua kedaluwarsa.${balanceAfter!==null?' Dana yang ditahan telah dikembalikan.':''}`,amount:Number(row.amount),referenceType:'WALLET_REQUEST_EXPIRED',referenceId:row.payload.walletRequestId,actionUrl:'history.html',priority:'NORMAL',metadata:{approvalId:row.id,balanceAfter}});
    }
    return rows.length;
  },{isolation:'SERIALIZABLE'});
}

export async function moneyIntegritySummary(session){
  requirePermission(session,'money:read');
  return tx(async client=>{
    const ledger=await verifyLedger(client);
    const {rows}=await client.query(`SELECT
      COUNT(*) FILTER(WHERE request_type='WITHDRAW' AND funds_state='RESERVED' AND status IN('PENDING','AWAITING_SECOND_APPROVAL','PROCESSING'))::int reserved_withdrawals,
      COALESCE(SUM(amount) FILTER(WHERE request_type='WITHDRAW' AND funds_state='RESERVED' AND status IN('PENDING','AWAITING_SECOND_APPROVAL','PROCESSING')),0)::bigint reserved_amount,
      COUNT(*) FILTER(WHERE status IN('PENDING','AWAITING_SECOND_APPROVAL','PROCESSING') AND created_at<now()-interval '2 hours')::int stale_requests,
      COUNT(*) FILTER(WHERE provider_status='CONFIRMED' AND status NOT IN('APPROVED','REVERSED'))::int provider_confirmed_pending,
      COUNT(*) FILTER(WHERE status='REVERSED')::int reversed_requests
      FROM wallet_requests`);
    const recent=(await client.query(`SELECT w.id,w.request_type,w.amount,w.currency,w.status,w.funds_state,w.provider_code,w.provider_reference,w.provider_status,w.created_at,u.username
      FROM wallet_requests w JOIN users u ON u.id=w.member_id ORDER BY w.created_at DESC LIMIT 80`)).rows;
    return{ledger,...rows[0],recent:recent.map(x=>({id:x.id,requestType:x.request_type,amount:Number(x.amount),currency:x.currency,status:x.status,fundsState:x.funds_state,providerCode:x.provider_code,providerReference:x.provider_reference,providerStatus:x.provider_status,username:x.username,createdAt:x.created_at}))};
  });
}

export async function ingestProviderEvent(apiKey,provider,input,ip=''){
  const providerCode=String(provider||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,60);
  const eventId=String(input.eventId||'').trim().slice(0,160);
  const requestId=String(input.walletRequestId||'').trim();
  const status=String(input.status||'RECEIVED').trim().toUpperCase();
  const providerReference=String(input.providerReference||'').trim().slice(0,160)||null;
  const amount=input.amount===undefined||input.amount===null?null:Number(input.amount);
  const currency=String(input.currency||MONEY_CURRENCY).trim().toUpperCase();
  assert(providerCode&&eventId,400,'Provider dan eventId wajib diisi.','PAYMENT_EVENT_INVALID');
  assert(['RECEIVED','CONFIRMED','FAILED','CANCELLED'].includes(status),400,'Status provider tidak valid.','PAYMENT_EVENT_STATUS_INVALID');
  assert(!amount||(Number.isSafeInteger(amount)&&amount>0),400,'Nominal provider tidak valid.','PAYMENT_EVENT_AMOUNT_INVALID');
  assert(currency===MONEY_CURRENCY,409,'Currency provider tidak sesuai.','PAYMENT_EVENT_CURRENCY_MISMATCH');
  return tx(async client=>{
    const dup=await client.query(`SELECT * FROM payment_provider_events WHERE provider_code=$1 AND provider_event_id=$2`,[providerCode,eventId]);
    if(dup.rows[0])return{duplicate:true,eventId,status:dup.rows[0].event_status};
    let wallet=null;
    if(requestId){wallet=(await client.query(`SELECT * FROM wallet_requests WHERE id=$1 FOR UPDATE`,[requestId])).rows[0];assert(wallet,404,'Wallet request tidak ditemukan.','REQUEST_NOT_FOUND');if(amount!==null)assert(Number(wallet.amount)===amount,409,'Nominal provider tidak sama dengan pengajuan.','PAYMENT_EVENT_AMOUNT_MISMATCH');const expectedProvider=String(wallet.payment_snapshot?.providerCode||wallet.provider_code||'').trim().toUpperCase();if(wallet.payment_snapshot?.integrationMode==='PROVIDER')assert(expectedProvider===providerCode,409,'Callback berasal dari provider yang tidak sesuai dengan metode pembayaran transaksi.','PAYMENT_EVENT_PROVIDER_MISMATCH');}
    const inserted=await client.query(`INSERT INTO payment_provider_events(id,provider_code,provider_event_id,wallet_request_id,provider_reference,event_status,amount,currency,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT(provider_code,provider_event_id) DO NOTHING RETURNING id`,[randomUUID(),providerCode,eventId,wallet?.id||null,providerReference,status,amount,currency,JSON.stringify(input)]);
    if(!inserted.rows[0])return{duplicate:true,eventId,status};
    if(wallet){
      if(providerReference){const conflict=await client.query(`SELECT id FROM wallet_requests WHERE provider_code=$1 AND provider_reference=$2 AND id<>$3`,[providerCode,providerReference,wallet.id]);assert(!conflict.rows[0],409,'Provider reference sudah digunakan.','PROVIDER_REFERENCE_DUPLICATE');}
      await client.query(`UPDATE wallet_requests SET provider_code=$1,provider_reference=COALESCE($2,provider_reference),provider_status=$3,updated_at=now() WHERE id=$4`,[providerCode,providerReference,status,wallet.id]);
      await recordMoneyEvent(client,{walletRequestId:wallet.id,memberId:wallet.member_id,eventType:`PROVIDER_${status}`,amount:Number(wallet.amount),currency:wallet.currency,metadata:{providerCode,eventId,providerReference,apiKey:apiKey.name}});
    }
    await audit({actorId:null,actorRole:`API_KEY:${apiKey.name}`,action:'PAYMENT_PROVIDER_EVENT',targetType:'WALLET_REQUEST',targetId:wallet?.id||eventId,details:{providerCode,eventId,status,providerReference},ip,client});
    return{duplicate:false,eventId,status,walletRequestId:wallet?.id||null};
  },{isolation:'SERIALIZABLE'});
}
