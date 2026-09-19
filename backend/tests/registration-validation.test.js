import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..','..');
const auth=readFileSync(resolve(root,'backend/src/auth.js'),'utf8');
const security=readFileSync(resolve(root,'backend/src/security.js'),'utf8');
const app=readFileSync(resolve(root,'backend/src/app.js'),'utf8');
const register=readFileSync(resolve(root,'frontend/register.html'),'utf8');
const registerJs=readFileSync(resolve(root,'frontend/js/register.js'),'utf8');

test('registration password policy is aligned at 8 characters with letters and digits',()=>{
  assert.match(register,/id="reg-password"[^>]*required/);
  assert.match(registerJs,/Min\. 8 karakter, berisi huruf dan angka/);
  assert.match(registerJs,/PASSWORD_RE\s*=\s*\/\^\(\?=.*\{8,72\}\$\//);
  assert.match(auth,/Password harus 8-72 karakter serta mengandung huruf dan angka\./);
  assert.match(security,/Password must be 8-128 characters/);
});

test('registration exposes live username availability and server-backed captcha routes',()=>{
  assert.match(app,/register\\\/username-availability/);
  assert.match(app,/register\\\/captcha/);
  assert.match(app,/verifyRegistrationCaptcha\(input\)/);
  assert.match(registerJs,/username-availability\?username=/);
  assert.match(registerJs,/api\.get\('\/member\/register\/captcha'\)/);
  assert.match(register,/id="captcha-container"/);
});

test('registration UI has real-time visual states for username, password confirmation and email',()=>{
  assert.match(registerJs,/Username sudah terdaftar\./);
  assert.match(registerJs,/Password tidak cocok\./);
  assert.match(registerJs,/Format email tidak valid\./);
  assert.match(register,/id="username-status"/);
});
