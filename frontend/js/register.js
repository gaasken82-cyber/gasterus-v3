/**
 * Gasterus v3 — Registration Form Logic
 */

import api from './api.js';
import auth from './auth.js';
import { showToast } from './utils.js';

let currentChallengeId = null;

export async function initRegister() {
  auth.updateHeaderAuthUI();
  if (auth.isLoggedIn()) {
    window.location.href = '/member.html';
    return;
  }

  await loadCaptcha();

  const refreshBtn = document.getElementById('btn-refresh-captcha');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadCaptcha);
  }

  const usernameInput = document.getElementById('reg-username');
  if (usernameInput) {
    usernameInput.addEventListener('blur', checkUsernameAvailability);
  }

  const form = document.getElementById('register-form');
  if (form) {
    form.addEventListener('submit', handleRegisterSubmit);
  }
}

async function loadCaptcha() {
  const container = document.getElementById('captcha-container');
  try {
    const res = await api.get('/member/register/captcha');
    currentChallengeId = res.challengeId;
    if (container && res.svg) {
      container.innerHTML = res.svg;
    }
  } catch (err) {
    console.warn('Captcha load error, using offline placeholder', err);
    if (container) {
      container.innerHTML = `<span style="font-weight:900;letter-spacing:4px;color:#111;padding:8px;">89X2B</span>`;
      currentChallengeId = 'local-dummy-challenge';
    }
  }
}

async function checkUsernameAvailability() {
  const usernameInput = document.getElementById('reg-username');
  const statusEl = document.getElementById('username-status');
  const val = usernameInput.value.trim();

  if (!val || val.length < 3) {
    if (statusEl) statusEl.textContent = '';
    return;
  }

  try {
    const res = await api.get(`/member/register/username-availability?username=${encodeURIComponent(val)}`);
    if (statusEl) {
      if (!res.valid) {
        statusEl.textContent = '❌ Format username tidak valid (3-12 karakter).';
        statusEl.style.color = 'var(--status-danger)';
      } else if (!res.available) {
        statusEl.textContent = '❌ Username sudah digunakan.';
        statusEl.style.color = 'var(--status-danger)';
      } else {
        statusEl.textContent = '✓ Username tersedia!';
        statusEl.style.color = 'var(--status-success)';
      }
    }
  } catch (err) {
    // ignore availability check errors
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

  if (password !== passwordConfirm) {
    showToast('Konfirmasi kata sandi tidak cocok.', 'warning');
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
    captchaChallengeId: currentChallengeId,
    captchaCode,
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
    await loadCaptcha(); // Refresh captcha after failed attempt
    form.captchaCode.value = '';
  }
}

// Auto init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRegister);
} else {
  initRegister();
}
