import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..','..','..');
const auth=readFileSync(resolve(root,'services/core/src/auth.js'),'utf8');
const security=readFileSync(resolve(root,'services/core/src/security.js'),'utf8');
const app=readFileSync(resolve(root,'services/core/src/app.js'),'utf8');
const register=readFileSync(resolve(root,'services/member/public/register.html'),'utf8');
const registerJs=readFileSync(resolve(root,'services/member/public/register-v2.js'),'utf8');

test('registration password policy is aligned at 8 characters with letters and digits',()=>{
  assert.match(register,/minlength="8"/);
  assert.match(register,/Minimal 8 karakter: huruf \+ angka/);
  assert.match(registerJs,/\.\{8,72\}\$\/\.test\(value\)/);
  assert.match(auth,/Password harus 8-72 karakter serta mengandung huruf dan angka\./);
  assert.match(security,/Password must be 8-128 characters/);
});

test('registration exposes live username availability and server-backed captcha routes',()=>{
  assert.match(app,/register\\\/username-availability/);
  assert.match(app,/register\\\/captcha/);
  assert.match(app,/verifyRegistrationCaptcha\(input\)/);
  assert.match(registerJs,/username-availability\?username=/);
  assert.match(registerJs,/\/api\/member\/register\/captcha/);
  assert.match(register,/id="regCaptchaImage"/);
});

test('registration UI has real-time visual states for username, password confirmation and email',()=>{
  assert.match(registerJs,/Username sudah digunakan\. Gunakan username lain\./);
  assert.match(registerJs,/Password tidak sama\./);
  assert.match(registerJs,/Email tidak valid\. Gunakan format seperti nama@gmail\.com\./);
  assert.match(register,/class="reg2-state"/);
});
