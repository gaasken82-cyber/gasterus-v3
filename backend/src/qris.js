import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { query, tx } from './db.js';
import { AppError, assert } from './errors.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { postTransfer, SYSTEM_ACCOUNTS } from './ledger.js';
import { audit } from './audit.js';
import { createMemberNotification } from './notifications.js';
import { fingerprintWalletRequest, MONEY_CURRENCY, recordMoneyEvent } from './money.js';
import { enforceResponsiblePlay } from './responsible-play.js';
import { danaConfigured, generateQris } from './qris-dana.js';

// ============================================================================
// QRIS auto deposit — dynamic QRIS (DANA) with webhook auto settlement.
// AUTO mode: create order -> show dynamic QR -> DANA Finish Notify webhook ->
// verified signature -> wallet credited via ledger (no admin action needed).
// MANUAL mode fallback: static QRIS shown, existing admin approval flow on the
// linked wallet_requests row credits the balance (legacy path, unchanged).
// ============================================================================
const MIN_AMOUNT=10_000;
const MAX_AMOUNT=200_000_000;

function qrisOutput(r,extra={}){
  return{
    orderId:r.id,
    walletRequestId:r.wallet_request_id,
    amount:Number(r.amount),
    currency:r.currency||MONEY_CURRENCY,
    status:r.status,
    settleMode:r.settle_mode,
    qrPayload:r.qr_payload||null,
    qrImage:r.qr_image||null,
    expiresAt:r.expires_at,
    paidAt:r.paid_at||null,
    ...extra
  };
}

export async function createQrisDeposit(session,input,ip=''){
  const amount=Number(input.amount);
  const requestKey=String(input.idempotencyKey||'').trim().slice(0,120);
  assert(Number.isSafeInteger(amount)&&amount>=MIN_AMOUNT&&amount<=MAX_AMOUNT,400,'Nominal deposit harus antara 10.000 dan 200.000.000.','QRIS_AMOUNT_INVALID');
  assert(requestKey.length>=16,400,'Idempotency key transaksi tidak valid. Muat ulang halaman dan coba lagi.','WALLET_IDEMPOTENCY_REQUIRED');
  const expiresAt=new Date(Date.now()+config.qrisOrderTtlMinutes*60_000);
  return tx(async client=>{
    const member=(await client.query(`SELECT id,username,status FROM users WHERE id=$1 FOR UPDATE`,[session.userId])).rows[0];
    assert(member&&member.status==='ACTIVE',403,'Akun tidak aktif.','ACCOUNT_INACTIVE');
    const duplicate=(await client.query(`SELECT * FROM qris_deposit_orders WHERE member_id=$1 AND request_key=$2`,[session.userId,requestKey])).rows[0];
    if(duplicate)return qrisOutput(duplicate,{duplicate:true});

    await enforceResponsiblePlay(session.userId,{kind:'DEPOSIT',amount,sessionCreatedAt:session.createdAt,client});

    // Linked wallet request keeps riwayat + admin dashboard consistent. In AUTO
    // mode the webhook settles this row; in MANUAL mode admins approve it as usual.
    const walletId=randomUUID();
    const paymentSnapshot={methodType:'QRIS',name:'QRIS (Otomatis)',integrationMode:'PROVIDER',providerCode:'DANA',currency:MONEY_CURRENCY};
    const fingerprint=fingerprintWalletRequest({requestType:'DEPOSIT',amount,paymentMethodId:null,referenceNumber:null,payoutSnapshot:null});
    await client.query(`INSERT INTO wallet_requests(id,member_id,request_type,amount,currency,payment_snapshot,request_key,request_fingerprint,funds_state)
      VALUES($1,$2,'DEPOSIT',$3,$4,$5::jsonb,$6,$7,'NONE')`,[walletId,session.userId,amount,MONEY_CURRENCY,JSON.stringify(paymentSnapshot),requestKey,fingerprint]);
    await recordMoneyEvent(client,{walletRequestId:walletId,memberId:session.userId,eventType:'DEPOSIT_REQUESTED',amount,currency:MONEY_CURRENCY,actorId:session.userId,metadata:{channel:'QRIS_AUTO'}});

    const orderId=randomUUID();
    const providerRef=`GSTR-${orderId}`;
    let qrPayload=null,qrImage=null,merchantTransId=null,mode='MANUAL';
    if(danaConfigured()){
      try{
        const gen=await generateQris({amount,partnerReference:providerRef,remarks:`Deposit ${member.username}`});
        qrPayload=gen.qrPayload;qrImage=gen.qrImage;merchantTransId=gen.merchantTransId;mode='AUTO';
      }catch(error){
        logger.error('QRIS provider generate failed, degrading to MANUAL mode',{error:error.message,orderId});
      }
    }
    if(!qrImage){
      const pm=(await client.query(`SELECT qr_image FROM payment_methods WHERE method_type='QRIS' AND is_active=TRUE AND qr_image IS NOT NULL ORDER BY sort_order LIMIT 1`)).rows[0];
      qrImage=pm?.qr_image||config.qrisStaticImageUrl||null;
    }
    if(!qrPayload)qrPayload=config.qrisStaticPayload||null;

    await client.query(`INSERT INTO qris_deposit_orders(id,member_id,wallet_request_id,amount,currency,request_key,provider_code,provider_ref,merchant_trans_id,qr_payload,qr_image,status,settle_mode,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,'DANA',$7,$8,$9,$10,'WAITING',$11,$12)`,
      [orderId,session.userId,walletId,amount,MONEY_CURRENCY,requestKey,providerRef,merchantTransId,qrPayload,qrImage,mode,expiresAt]);
    await audit({actorId:session.userId,actorRole:'MEMBER',action:'QRIS_DEPOSIT_ORDER_CREATED',targetType:'QRIS_ORDER',targetId:orderId,details:{walletRequestId:walletId,amount,mode,providerRef},ip,client});
    const row=(await client.query('SELECT * FROM qris_deposit_orders WHERE id=$1',[orderId])).rows[0];
    return qrisOutput(row,{duplicate:false});
  },{isolation:'SERIALIZABLE'});
}

export async function qrisOrderStatus(session,orderId){
  const {rows}=await query(`SELECT o.*,w.status AS w_status FROM qris_deposit_orders o JOIN wallet_requests w ON w.id=o.wallet_request_id WHERE o.id=$1 AND o.member_id=$2`,[orderId,session.userId]);
  const r=rows[0];
  assert(r,404,'Transaksi QRIS tidak ditemukan.','QRIS_ORDER_NOT_FOUND');
  if(r.status==='WAITING'&&new Date(r.expires_at)<new Date()){
    await query(`UPDATE qris_deposit_orders SET status='EXPIRED',updated_at=now() WHERE id=$1 AND status='WAITING'`,[orderId]);
    r.status='EXPIRED';
  }
  const credited=r.w_status==='APPROVED';
  return{
    orderId:r.id,
    status:credited?'PAID':r.status,
    settleMode:r.settle_mode,
    amount:Number(r.amount),
    balanceCredited:credited,
    paidAt:r.paid_at||null
  };
}

// Raw body reader for webhook signature verification.
export async function rawBody(request,limit=65_536){
  const chunks=[];let size=0;
  for await(const chunk of request){size+=chunk.length;if(size>limit)throw new AppError(413,'Ukuran permintaan terlalu besar.','PAYLOAD_TOO_LARGE');chunks.push(chunk);}
  return Buffer.concat(chunks);
}

const PAID_STATUSES=new Set(['PAID','SUCCESS','SETTLED','PAY_SUCCESS','FINISH','00']);

export async function handleQrisNotify(rawBodyBuffer,headers){
  const secret=config.danaWebhookSecret;
  assert(secret,503,'Webhook QRIS belum dikonfigurasi.','QRIS_WEBHOOK_NOT_CONFIGURED');
  const provided=String(headers['x-signature']||'');
  assert(provided,401,'Signature webhook wajib disertakan.','QRIS_SIGNATURE_MISSING');
  const expected=createHmac('sha256',secret).update(rawBodyBuffer).digest('hex');
  const a=Buffer.from(provided),b=Buffer.from(expected);
  assert(a.length===b.length&&timingSafeEqual(a,b),401,'Signature webhook tidak valid.','QRIS_SIGNATURE_INVALID');
  let payload;
  try{payload=JSON.parse(rawBodyBuffer.toString('utf8'));}catch{throw new AppError(400,'Format JSON tidak valid.','INVALID_JSON');}
  const partnerRef=String(payload.partnerReferenceNo||payload.partnerReference||payload.reference||'');
  const amount=Math.round(Number(payload.amount?.value??payload.amount));
  const status=String(payload.status||payload.resultStatus||payload.transactionStatus||'').toUpperCase();
  assert(partnerRef&&Number.isSafeInteger(amount)&&amount>0,400,'Payload webhook tidak valid.','QRIS_NOTIFY_INVALID');
  if(!PAID_STATUSES.has(status))return{ok:true,ignored:status||'UNKNOWN'};
  return tx(async client=>{
    const order=(await client.query(`SELECT o.*,w.status AS w_status FROM qris_deposit_orders o JOIN wallet_requests w ON w.id=o.wallet_request_id WHERE o.provider_ref=$1 FOR UPDATE`,[partnerRef])).rows[0];
    if(!order)return{ok:true,unknown:true};
    if(order.status==='PAID'||order.w_status==='APPROVED')return{ok:true,duplicate:true};
    assert(Number(order.amount)===amount,409,'Nominal webhook tidak sesuai dengan transaksi.','PAYMENT_EVENT_AMOUNT_MISMATCH');
    const walletId=order.wallet_request_id;
    const ledger=await postTransfer(client,{memberId:order.member_id,systemCode:SYSTEM_ACCOUNTS.CLEARING,memberDelta:amount,type:'WALLET_DEPOSIT_SETTLED',referenceType:'WALLET_REQUEST',referenceId:walletId,idempotencyKey:`wallet-settle:${walletId}`,metadata:{qrisOrderId:order.id,providerRef,providerCode:order.provider_code},actorId:null});
    await client.query(`UPDATE wallet_requests SET status='APPROVED',funds_state='SETTLED',provider_code=$1,provider_reference=$2,provider_status='CONFIRMED',reviewed_at=COALESCE(reviewed_at,now()),settled_at=now(),updated_at=now() WHERE id=$3`,[order.provider_code,partnerRef,walletId]);
    await client.query(`UPDATE qris_deposit_orders SET status='PAID',paid_at=now(),settled_at=now(),raw_notify=$2::jsonb,updated_at=now() WHERE id=$1`,[order.id,JSON.stringify(payload).slice(0,20_000)]);
    await recordMoneyEvent(client,{walletRequestId:walletId,memberId:order.member_id,eventType:'DEPOSIT_SETTLED',amount,currency:order.currency||MONEY_CURRENCY,actorId:null,metadata:{balanceAfter:ledger.after,providerRef,autoQris:true}});
    await createMemberNotification(client,{memberId:order.member_id,type:'DEPOSIT_APPROVED',title:'Deposit QRIS Berhasil',message:`Saldo sebesar IDR ${amount.toLocaleString('id-ID')} telah masuk ke saldo Anda.`,amount,referenceType:'WALLET_REQUEST',referenceId:walletId,actionUrl:'history.html',priority:'HIGH',metadata:{balanceAfter:ledger.after,autoQris:true}});
    await audit({actorRole:'SYSTEM',action:'QRIS_DEPOSIT_AUTO_SETTLED',targetType:'QRIS_ORDER',targetId:order.id,details:{walletRequestId:walletId,amount,providerRef,balanceAfter:ledger.after}});
    return{ok:true,balanceAfter:ledger.after};
  },{isolation:'SERIALIZABLE'});
}
