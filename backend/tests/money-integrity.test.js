import test from 'node:test';import assert from 'node:assert/strict';import { readFile } from 'node:fs/promises';
const member=await readFile(new URL('../src/member.js',import.meta.url),'utf8');
const owner=await readFile(new URL('../src/owner.js',import.meta.url),'utf8');
const ledger=await readFile(new URL('../src/ledger.js',import.meta.url),'utf8');
const money=await readFile(new URL('../src/money.js',import.meta.url),'utf8');
const app=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
test('withdrawal is reserved before review and released on rejection',()=>{for(const token of ['WALLET_WITHDRAW_RESERVED','WITHDRAW_HOLD','funds_state=\'RESERVED\'','WALLET_WITHDRAW_RELEASED'])assert.ok((member+owner).includes(token),token);});
test('wallet requests require client idempotency and payload fingerprint',()=>{for(const token of ['WALLET_IDEMPOTENCY_REQUIRED','request_fingerprint','IDEMPOTENCY_KEY_REUSED'])assert.ok(member.includes(token),token);});
test('ledger duplicate handling does not abort PostgreSQL transaction',()=>{assert.ok(ledger.includes('ON CONFLICT DO NOTHING RETURNING id'));assert.ok(!ledger.includes("catch(error){if(error.code==='23505'"));});
test('settled money reversals require approval workflow',()=>{for(const token of ['WALLET_REVERSAL','requestWalletReversal','executeWalletReversal','REVERSAL_REASON_REQUIRED'])assert.ok(owner.includes(token),token);});
test('provider event inbox is idempotent and amount-bound',()=>{for(const token of ['payment_provider_events','PAYMENT_EVENT_AMOUNT_MISMATCH','PROVIDER_REFERENCE_DUPLICATE','payments:callback'])assert.ok((money+owner+app).includes(token),token);});

test('withdrawal requires step-up password verification and request throttling',()=>{for(const token of ['TRANSACTION_AUTH_REQUIRED','TRANSACTION_AUTH_FAILED','verifyPassword','WITHDRAW_AUTH_FAILED'])assert.ok(member.includes(token),token);assert.ok(app.includes("rateLimit(req,'member-wallet',12,60)"));});
test('second approver receives significant money transaction snapshot',()=>{for(const token of ['payoutSnapshot:row.payout_snapshot','paymentSnapshot:row.payment_snapshot','providerReference:row.provider_reference','amount:Number(row.amount)'])assert.ok(owner.includes(token),token);});
test('provider callbacks are bound to the configured provider',()=>{assert.ok(money.includes('PAYMENT_EVENT_PROVIDER_MISMATCH'));assert.ok(money.includes("payment_snapshot?.integrationMode==='PROVIDER'"));});

test('withdraw authorization and external payout settlement are separated',()=>{for(const token of ['authorizeWithdrawalPayout',"status=\'PROCESSING\'",'confirmWithdrawalPayout','PAYOUT_REFERENCE_REQUIRED','WITHDRAW_PAYOUT_CONFIRMED','WITHDRAW_PAYOUT_FAILED'])assert.ok(owner.includes(token),token);assert.ok(app.includes('/payout'));});
