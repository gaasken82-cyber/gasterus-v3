/**
 * Gasterus v3 — Landing Page Logic
 */

import api from './api.js';
import auth from './auth.js';
import { getTimeRemaining, showToast } from './utils.js';

let marketsList = [];
let timerInterval = null;

export async function initLanding() {
  auth.updateHeaderAuthUI();
  setupAuthModal();
  await loadMarkets();
  startTimers();
}

async function loadMarkets() {
  const container = document.getElementById('markets-grid-container');
  if (!container) return;

  try {
    // Attempt public endpoint, or member-api
    const res = await api.get('/public/markets').catch(() => api.get('/member-api/markets'));
    marketsList = res.items || res.data || res || [];
    renderMarkets(marketsList);
  } catch (err) {
    console.warn('Could not fetch real-time markets, loading fallback display', err);
    // Display preview markets if server is not active
    marketsList = [
      { name: 'SINGAPORE 4D', code: 'SGP', period: '2981', result: '7492', bettingStatus: 'OPEN', closeAt: new Date(Date.now() + 3600000).toISOString() },
      { name: 'HONGKONG', code: 'HK', period: '1420', result: '3180', bettingStatus: 'OPEN', closeAt: new Date(Date.now() + 7200000).toISOString() },
      { name: 'SYDNEY', code: 'SDY', period: '0854', result: '5921', bettingStatus: 'CLOSED', closeAt: null },
      { name: 'MACAU 4D', code: 'MC4D', period: '4190', result: '8034', bettingStatus: 'OPEN', closeAt: new Date(Date.now() + 1800000).toISOString() }
    ];
    renderMarkets(marketsList);
  }
}

function renderMarkets(markets) {
  const container = document.getElementById('markets-grid-container');
  if (!container) return;

  if (!markets || markets.length === 0) {
    container.innerHTML = `<div class="card" style="grid-column: 1 / -1; text-align: center; color: var(--text-muted);">Sedang memuat data pasaran...</div>`;
    return;
  }

  container.innerHTML = markets.slice(0, 8).map(m => {
    const isClosed = m.bettingStatus === 'CLOSED' || m.bettingStatus === 'SUSPENDED';
    const statusBadge = isClosed
      ? `<span class="badge badge-danger">Tutup</span>`
      : `<span class="badge badge-success">Buka</span>`;

    const digits = (m.result ? String(m.result) : '----').split('');
    const ballsHtml = digits.map(d => `<span class="ball-num">${d}</span>`).join('');

    return `
      <div class="market-card fade-in">
        <div class="market-top">
          <span class="market-name">${m.name}</span>
          ${statusBadge}
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">Periode: <strong>#${m.period || '-'}</strong></div>
        <div class="market-result-display">
          ${ballsHtml}
        </div>
        <div class="market-footer">
          <span>${isClosed ? 'Tutup Pasaran' : 'Sisa Waktu:'}</span>
          <span class="countdown-timer" data-close="${m.closeAt || ''}">${isClosed ? '-' : 'Menghitung...'}</span>
        </div>
        <a href="${auth.isLoggedIn() ? '/market-play.html?code=' + (m.code || m.slug) : '#login'}" class="btn btn-outline btn-sm btn-block" style="margin-top: 4px;" onclick="${auth.isLoggedIn() ? '' : 'window.openLoginModal(event)'}">
          Pasang Angka
        </a>
      </div>
    `;
  }).join('');
}

function startTimers() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    document.querySelectorAll('.countdown-timer[data-close]').forEach(el => {
      const closeAt = el.getAttribute('data-close');
      if (!closeAt) return;
      const t = getTimeRemaining(closeAt);
      if (t.expired) {
        el.textContent = 'Ditutup';
      } else {
        const hh = String(t.hours).padStart(2, '0');
        const mm = String(t.minutes).padStart(2, '0');
        const ss = String(t.seconds).padStart(2, '0');
        el.textContent = `${hh}:${mm}:${ss}`;
      }
    });
  }, 1000);
}

function setupAuthModal() {
  const modal = document.getElementById('login-modal');
  const closeBtn = document.getElementById('close-login-modal');
  const loginForm = document.getElementById('login-form');

  window.openLoginModal = (e) => {
    if (e) e.preventDefault();
    if (modal) modal.classList.add('active');
  };

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const username = loginForm.username.value.trim();
      const password = loginForm.password.value;

      if (!username || !password) {
        showToast('Mohon masukkan username dan password.', 'warning');
        return;
      }

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Memproses...';
        await auth.login(username, password);
        showToast('Login berhasil! Selamat datang kembali.', 'success');
        setTimeout(() => {
          window.location.href = '/member.html';
        }, 600);
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Masuk Akun';
      }
    });
  }
}

// Auto init when document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLanding);
} else {
  initLanding();
}
