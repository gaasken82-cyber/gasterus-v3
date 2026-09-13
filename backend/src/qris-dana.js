import { createSign, randomUUID } from 'node:crypto';
import { config } from './config.js';

// ============================================================================
// DANA OpenAPI — QRIS Acquirer client (dynamic QRIS generation).
//
// Credentials are provided via environment variables:
//   DANA_MID            merchant ID (MID) from DANA merchant portal
//   DANA_MERCHANT_ID    partner / merchant secret-linked identifier
//   DANA_PRIVATE_KEY    RSA private key (PEM) used to sign requests
//   DANA_WEBHOOK_SECRET shared secret used to verify Finish Notify signatures
//
// When any of these is missing the system automatically degrades to MANUAL
// mode (static QRIS + existing admin approval flow) so deposits never break.
// ============================================================================
export function danaConfigured(){
  return Boolean(config.danaMid&&config.danaMerchantId&&config.danaPrivateKeyPem&&config.danaWebhookSecret);
}

function signPayload(raw){
  const signer=createSign('RSA-SHA256');
  signer.update(raw);
  signer.end();
  return signer.sign(config.danaPrivateKeyPem,'base64');
}

export async function generateQris({amount,partnerReference,remarks=''}){
  const timestamp=new Date().toISOString();
  const payload={
    version:'1.0',
    requestId:randomUUID(),
    timestamp,
    partnerReferenceNo:partnerReference,
    merchantId:config.danaMid,
    merchantTransId:`GSTR${Date.now()}${Math.floor(Math.random()*1_000_000)}`,
    amount:{value:String(amount),currency:'IDR'},
    validUntil:new Date(Date.now()+config.qrisOrderTtlMinutes*60_000).toISOString(),
    remarks:String(remarks).slice(0,120)
  };
  const raw=JSON.stringify(payload);
  const res=await fetch(`${config.danaApiUrl}${config.danaGenerateQrisPath}`,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-signature':signPayload(raw),
      'x-timestamp':timestamp,
      'x-partner-id':config.danaMerchantId
    },
    body:raw,
    signal:AbortSignal.timeout(config.qrisProviderTimeoutMs)
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(`DANA generate QRIS gagal (HTTP ${res.status})`);
  const qrPayload=data?.qrContent||data?.data?.qrContent||data?.result?.qrContent||null;
  if(!qrPayload)throw new Error('DANA tidak mengembalikan qrContent');
  return{
    qrPayload,
    qrImage:data?.qrImageUrl||data?.data?.qrImageUrl||null,
    merchantTransId:payload.merchantTransId,
    raw:data
  };
}
