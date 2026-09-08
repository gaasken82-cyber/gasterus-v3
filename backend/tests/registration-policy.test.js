import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidMemberEmail, isValidMemberPassword, isValidMemberUsername } from '../src/registration-policy.js';

test('member username policy',()=>{
  assert.equal(isValidMemberUsername('test123'),true);
  assert.equal(isValidMemberUsername('TEST_123'),true);
  assert.equal(isValidMemberUsername('ab'),false);
  assert.equal(isValidMemberUsername('name-with-dash'),false);
  assert.equal(isValidMemberUsername('usernamelebihpanjang'),false);
});

test('member password policy requires minimum 8, letter and digit',()=>{
  assert.equal(isValidMemberPassword('abc12345'),true);
  assert.equal(isValidMemberPassword('12345678'),false);
  assert.equal(isValidMemberPassword('abcdefgh'),false);
  assert.equal(isValidMemberPassword('abc1234'),false);
});

test('member email policy accepts normal providers and rejects malformed email',()=>{
  for (const email of ['nama@gmail.com','user@yahoo.com','member@hotmail.com','orang@mail.co.id','a+b@company.co']) assert.equal(isValidMemberEmail(email),true,email);
  for (const email of ['nama@gmail','nama@','@gmail.com','nama gmail.com','nama@-gmail.com','nama@gmail..com']) assert.equal(isValidMemberEmail(email),false,email);
});
