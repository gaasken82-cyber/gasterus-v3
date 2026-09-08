import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..','..','..');
const html=readFileSync(resolve(root,'services/admin/public/payments.html'),'utf8');

test('payment center does not collide with window.name and resolves form controls explicitly',()=>{
  assert.match(html,/id="paymentName"/);
  assert.doesNotMatch(html,/id="name"/);
  assert.match(html,/paymentName:document\.getElementById\('paymentName'\)/);
  assert.match(html,/name:paymentName/);
  assert.doesNotMatch(html,/\bname\.value\b/);
  assert.match(html,/Metode pembayaran berhasil disimpan\./);
});
