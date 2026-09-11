/**
 * Gasterus v3 — Registration Form Logic
 */

import api from './api.js';
import auth from './auth.js';
import { showToast } from './utils.js';

let currentChallengeId = null;
let usernameTimer = null;
let accountNumberTimer = null;
let emailTimer = null;
let captchaLastRefresh = 0;

const USERNAME_RE = /^[A-Za-z0-9_]{3,12}$/;
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function initRegister() {
  auth.updateHeaderAuthUI();
  if (auth.isLoggedIn()) {
    window.location.href = '/member.html';
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get('ref') || urlParams.get('referral');
  if (ref) {
    const refInput = document.getElementById('reg-referral');
    const refLabel = document.querySelector('.reg-referral-value');
    if (refInput) refInput.value = ref.trim();
    if (refLabel) refLabel.textContent = ref.trim();
  }

  await loadCaptcha();

  const refreshBtn = document.getElementById('btn-refresh-captcha');
  if (refreshBtn) refreshBtn.addEventListener('click', loadCaptcha);

  const usernameInput = document.getElementById('reg-username');
  if (usernameInput) {
    usernameInput.addEventListener('input', () => {
      if (usernameTimer) clearTimeout(usernameTimer);
      usernameTimer = setTimeout(checkUsernameAvailability, 350);
    });
    usernameInput.addEventListener('blur', checkUsernameAvailability);
  }

  const passwordInput = document.getElementById('reg-password');
  if (passwordInput) passwordInput.addEventListener('input', validatePasswordField);

  const confirmInput = document.getElementById('reg-password-confirm');
  if (confirmInput) confirmInput.addEventListener('input', validateConfirmField);

  const emailInput = document.getElementById('reg-email');
  if (emailInput) {
    emailInput.addEventListener('blur', validateEmailField);
    emailInput.addEventListener('input', () => {
      if (emailTimer) clearTimeout(emailTimer);
      emailTimer = setTimeout(validateEmailField, 400);
    });
  }

  const phoneInput = document.getElementById('reg-phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', validatePhoneField);
    phoneInput.addEventListener('blur', validatePhoneField);
  }

  const accountNameInput = document.getElementById('reg-account-name');
  if (accountNameInput) accountNameInput.addEventListener('input', validateAccountNameField);

  const accountNumberInput = document.getElementById('reg-account-number');
  if (accountNumberInput) {
    accountNumberInput.addEventListener('input', () => {
      if (accountNumberTimer) clearTimeout(accountNumberTimer);
      accountNumberTimer = setTimeout(checkAccountNumberAvailability, 400);
    });
    accountNumberInput.addEventListener('blur', checkAccountNumberAvailability);
  }

  const form = document.getElementById('register-form');
  if (form) form.addEventListener('submit', handleRegisterSubmit);
}

function setStatus(id, text, ok = null, borderInputId = null) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text || '';
    if (text) {
      el.style.color = ok ? 'var(--status-success)' : 'var(--status-danger)';
    } else {
      el.style.color = '';
    }
  }
  if (!borderInputId) return;
  const input = document.getElementById(borderInputId);
  if (!input) return;
  const wrap = input.closest('.reg-phone-wrap');
  const targets = wrap ? [input, wrap] : [input];
  for (const t of targets) {
    t.classList.remove('is-valid', 'is-invalid');
    if (text && ok === true) t.classList.add('is-valid');
    else if (text && ok === false) t.classList.add('is-invalid');
  }
}

async function loadCaptcha() {
  const now = Date.now();
  if (now - captchaLastRefresh < 800) return; // debounce spam clicks on refresh
  captchaLastRefresh = now;
  const container = document.getElementById('captcha-container');
  const refreshBtn = document.getElementById('btn-refresh-captcha');
  if (refreshBtn) refreshBtn.disabled = true;
  try {
    const res = await api.get('/member/register/captcha');
    const data = res?.data || res || {};
    currentChallengeId = data.challengeId || null;
    if (container && data.image) {
      container.innerHTML = `<img src="${data.image}" alt="Captcha" style="display:block;max-width:100%;height:auto;">`;
    }
  } catch (err) {
    console.warn('Captcha load error, using offline placeholder', err);
    if (container) {
      container.innerHTML = `<span style="font-weight:900;letter-spacing:4px;color:#111;padding:8px;">89X2B</span>`;
      currentChallengeId = 'local-dummy-challenge';
    }
  }
  if (refreshBtn) refreshBtn.disabled = false;
}

async function checkUsernameAvailability() {
  const usernameInput = document.getElementById('reg-username');
  const val = usernameInput.value.trim();

  if (!val) {
    setStatus('username-status', '', null, 'reg-username');
    return;
  }
  if (!USERNAME_RE.test(val)) {
    setStatus('username-status', '✗ Username 3-12 karakter (huruf, angka, _).', false, 'reg-username');
    return;
  }

  try {
    const res = await api.get(`/member/register/username-availability?username=${encodeURIComponent(val)}`);
    const data = res?.data || res || {};
    if (data.valid === false) {
      setStatus('username-status', '✗ Username tidak valid.', false, 'reg-username');
    } else if (data.available === false) {
      setStatus('username-status', '✗ Username sudah terdaftar.', false, 'reg-username');
    } else {
      setStatus('username-status', '✓ Username tersedia!', true, 'reg-username');
    }
  } catch (err) {
    // ignore availability check errors
  }
}

function validatePasswordField() {
  const val = document.getElementById('reg-password').value;
  if (!val) { setStatus('password-status', '', null, 'reg-password'); return; }
  if (!PASSWORD_RE.test(val)) {
    setStatus('password-status', '✗ Min. 8 karakter, berisi huruf dan angka.', false, 'reg-password');
  } else {
    setStatus('password-status', '✓ Kuat kuat.', true, 'reg-password');
  }
  validateConfirmField();
}

function validateConfirmField() {
  const pwd = document.getElementById('reg-password').value;
  const conf = document.getElementById('reg-password-confirm').value;
  if (!conf) { setStatus('confirm-status', '', null, 'reg-password-confirm'); return; }
  if (pwd !== conf) {
    setStatus('confirm-status', '✗ Password tidak cocok.', false, 'reg-password-confirm');
  } else {
    setStatus('confirm-status', '✓ Cocok.', true, 'reg-password-confirm');
  }
}

async function validateEmailField() {
  const val = document.getElementById('reg-email').value.trim();
  if (!val) { setStatus('email-status', '', null, 'reg-email'); return; }
  if (!EMAIL_RE.test(val)) {
    setStatus('email-status', '✗ Format email tidak valid.', false, 'reg-email');
    return;
  }
  try {
    const res = await api.get(`/member/register/email-availability?email=${encodeURIComponent(val)}`);
    const data = res?.data || res || {};
    if (data.valid === false) {
      setStatus('email-status', '✗ Format email tidak valid.', false, 'reg-email');
    } else if (data.available === false) {
      setStatus('email-status', '✗ Email sudah terdaftar.', false, 'reg-email');
    } else {
      setStatus('email-status', '✓ Email tersedia.', true, 'reg-email');
    }
  } catch (err) {
    setStatus('email-status', '✓ Format email valid.', true, 'reg-email');
  }
}

function validatePhoneField() {
  const val = String(document.getElementById('reg-phone').value || '').replace(/\D/g, '');
  if (!val) { setStatus('phone-status', '', null, 'reg-phone'); return; }
  if (!/^\d{8,13}$/.test(val)) {
    setStatus('phone-status', '✗ No. HP tidak valid (8-13 digit).', false, 'reg-phone');
  } else {
    setStatus('phone-status', '✓ No. HP valid.', true, 'reg-phone');
  }
}

function validateAccountNameField() {
  const val = String(document.getElementById('reg-account-name').value || '').trim();
  if (!val) { setStatus('account-name-status', '', null, 'reg-account-name'); return; }
  setStatus('account-name-status', '✓ Nama rekening valid.', true, 'reg-account-name');
}

async function checkAccountNumberAvailability() {
  const input = document.getElementById('reg-account-number');
  const val = String(input.value || '').replace(/\s+/g, '');
  if (!val) { setStatus('account-number-status', '', null, 'reg-account-number'); return; }
  if (!/^\d{6,20}$/.test(val)) {
    setStatus('account-number-status', '✗ Nomor rekening 6-20 digit angka.', false, 'reg-account-number');
    return;
  }
  try {
    const res = await api.get(`/member/register/account-availability?account=${encodeURIComponent(val)}`);
    const data = res?.data || res || {};
    if (data.valid === false) {
      setStatus('account-number-status', '✗ Nomor rekening tidak valid.', false, 'reg-account-number');
    } else if (data.available === false) {
      setStatus('account-number-status', '✗ Nomor rekening sudah terdaftar.', false, 'reg-account-number');
    } else {
      setStatus('account-number-status', '✓ Nomor rekening bisa digunakan.', true, 'reg-account-number');
    }
  } catch (err) {
    // Abaikan error cek (mis. offline) agar tidak menghalangi pendaftaran.
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');

  const username = form.username.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;
  const passwordConfirm = form.passwordConfirm.value;
  const phone = String(form.phone.value || '').replace(/\D/g, '');
  const bankName = form.bankName.value;
  const accountNumber = form.accountNumber.value.trim();
  const accountName = form.accountName.value.trim();
  const captchaCode = form.captchaCode.value.trim();
  const referralCode = form.referralCode.value.trim();

  // Re-validate all inline fields before sending.
  if (!USERNAME_RE.test(username)) {
    setStatus('username-status', '✗ Username 3-12 karakter (huruf, angka, _).', false, 'reg-username');
    showToast('Periksa format username.', 'danger');
    return;
  }
  if (!PASSWORD_RE.test(password)) {
    validatePasswordField();
    showToast('Password harus 8-72 karakter serta mengandung huruf dan angka.', 'danger');
    return;
  }
  if (password !== passwordConfirm) {
    validateConfirmField();
    showToast('Konfirmasi kata sandi tidak cocok.', 'danger');
    return;
  }
  if (!EMAIL_RE.test(email)) {
    validateEmailField();
    showToast('Periksa format email.', 'danger');
    return;
  }
  if (!/^\d{8,13}$/.test(phone)) {
    validatePhoneField();
    showToast('Periksa format nomor HP (8-13 digit).', 'danger');
    return;
  }
  if (!String(accountName || '').trim()) {
    setStatus('account-name-status', '✗ Nama rekening wajib diisi.', false, 'reg-account-name');
    showToast('Nama rekening wajib diisi.', 'danger');
    return;
  }
  if (!/^\d{6,20}$/.test(String(accountNumber || '').replace(/\s+/g, ''))) {
    setStatus('account-number-status', '✗ Nomor rekening 6-20 digit angka.', false, 'reg-account-number');
    showToast('Periksa format nomor rekening.', 'danger');
    return;
  }

  if (!currentChallengeId || !captchaCode) {
    showToast('Mohon masukkan kode captcha keamanan.', 'danger');
    return;
  }

  const payload = {
    username,
    email,
    password,
    phone,
    bankName,
    accountNumber,
    accountName,
    captchaId: currentChallengeId,
    captchaAnswer: captchaCode,
    referralCode: referralCode || undefined
  };

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Mendaftarkan Akun...';

    await auth.register(payload);
    showToast('Pendaftaran Berhasil! Selamat bermain di Gasterus.', 'success');
    setTimeout(() => {
      window.location.href = '/member.html';
    }, 800);
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Daftar';
    const code = err?.data?.error?.code || err?.data?.code;
    if (code === 'USERNAME_TAKEN') setStatus('username-status', '✗ Username sudah terdaftar.', false, 'reg-username');
    if (code === 'EMAIL_TAKEN') setStatus('email-status', '✗ Email sudah terdaftar.', false, 'reg-email');
    if (code === 'ACCOUNT_NUMBER_TAKEN') setStatus('account-number-status', '✗ Nomor rekening sudah terdaftar.', false, 'reg-account-number');
    const msg = err?.data?.error?.message || err?.data?.message || (code ? `Pendaftaran gagal (${code}).` : 'Pendaftaran gagal. Periksa koneksi Anda dan coba lagi.');
    showToast(msg, 'danger');
    await loadCaptcha();
    form.captchaCode.value = '';
  }
}

// Auto init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRegister);
} else {
  initRegister();
}
