/**
 * Gasterus v3 — Registration Form Logic
 */

import api from './api.js';
import auth from './auth.js';
import { showToast } from './utils.js';

let currentChallengeId = null;
let usernameTimer = null;

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
  if (emailInput) emailInput.addEventListener('blur', validateEmailField);

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
  if (borderInputId) {
    const input = document.getElementById(borderInputId);
    if (input) {
      input.style.borderColor = text ? (ok ? '' : '#ef4444') : '';
    }
  }
}

async function loadCaptcha() {
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
  if (!val) { setStatus('password-status', '', null); return; }
  if (!PASSWORD_RE.test(val)) {
    setStatus('password-status', '✗ Min. 8 karakter, berisi huruf dan angka.', false, 'reg-password');
  } else {
    setStatus('password-status', '✓ Kuat kuat.', true);
  }
  validateConfirmField();
}

function validateConfirmField() {
  const pwd = document.getElementById('reg-password').value;
  const conf = document.getElementById('reg-password-confirm').value;
  if (!conf) { setStatus('confirm-status', '', null); return; }
  if (pwd !== conf) {
    setStatus('confirm-status', '✗ Password tidak cocok.', false, 'reg-password-confirm');
  } else {
    setStatus('confirm-status', '✓ Cocok.', true);
  }
}

function validateEmailField() {
  const val = document.getElementById('reg-email').value.trim();
  if (!val) { setStatus('email-status', '', null); return; }
  if (!EMAIL_RE.test(val)) {
    setStatus('email-status', '✗ Format email tidak valid.', false, 'reg-email');
  } else {
    setStatus('email-status', '✓ Format valid.', true);
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
  const phone = form.phone.value.trim();
  const bankName = form.bankName.value;
  const accountNumber = form.accountNumber.value.trim();
  const accountName = form.accountName.value.trim();
  const captchaCode = form.captchaCode.value.trim();
  const referralCode = form.referralCode.value.trim();

  // Re-validate all inline fields before sending.
  if (!USERNAME_RE.test(username)) {
    setStatus('username-status', '✗ Username 3-12 karakter (huruf, angka, _).', false, 'reg-username');
    showToast('Periksa format username.', 'warning');
    return;
  }
  if (!PASSWORD_RE.test(password)) {
    validatePasswordField();
    showToast('Password harus 8-72 karakter serta mengandung huruf dan angka.', 'warning');
    return;
  }
  if (password !== passwordConfirm) {
    validateConfirmField();
    showToast('Konfirmasi kata sandi tidak cocok.', 'warning');
    return;
  }
  if (!EMAIL_RE.test(email)) {
    validateEmailField();
    showToast('Periksa format email.', 'warning');
    return;
  }

  if (!currentChallengeId || !captchaCode) {
    showToast('Mohon masukkan kode captcha keamanan.', 'warning');
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
    submitBtn.textContent = 'Daftar Akun Baru';
    const code = err?.data?.error?.code || err?.data?.code;
    if (code === 'USERNAME_TAKEN') setStatus('username-status', '✗ Username sudah terdaftar.', false, 'reg-username');
    if (code === 'EMAIL_TAKEN') setStatus('email-status', '✗ Email sudah terdaftar.', false, 'reg-email');
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
