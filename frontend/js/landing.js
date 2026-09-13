/**
 * Gasterus v3 — Landing Page Logic
 * Features: Real-time "Hasil Terakhir" Live Draw, Instant Pool Search, Real Authentic Numbers
 */

import api from './api.js';
import auth from './auth.js';
import { getTimeRemaining, showToast } from './utils.js';

let marketsList = [];
let isExpanded = false;

// Generate dynamic default results based on current date
function generateDefaultResults() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const formatDate = (d) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  const todayStr = formatDate(today);
  const yesterdayStr = formatDate(yesterday);

  return [
    { name: 'SYDNEY', code: 'SDY', date: todayStr, result: '----', period: '----' },
    { name: 'HONGKONG', code: 'HK', date: todayStr, result: '----', period: '----' },
    { name: 'SINGAPORE', code: 'SGP', date: todayStr, result: '----', period: '----' },
    { name: '4D TOTO MACAU', code: '4TMP', date: todayStr, result: '----', period: '----' },
    { name: '5D TOTO MACAU', code: '5TMP', date: yesterdayStr, result: '----', period: '----' },
    { name: 'KING KONG 4D', code: 'KK4P', date: yesterdayStr, result: '----', period: '----' },
    { name: 'NEWYORK', code: 'NY', date: todayStr, result: '----', period: '----' },
    { name: 'CALIFORNIA', code: 'CAL', date: todayStr, result: '----', period: '----' },
    { name: 'CAMBODIA', code: 'CMD', date: yesterdayStr, result: '----', period: '----' },
    { name: 'CHINA', code: 'CHN', date: yesterdayStr, result: '----', period: '----' },
    { name: 'TAIWAN', code: 'TW', date: yesterdayStr, result: '----', period: '----' },
    { name: 'PCSO', code: 'PCSO', date: yesterdayStr, result: '----', period: '----' },
    { name: 'JEPANG', code: 'JPN', date: yesterdayStr, result: '----', period: '----' },
    { name: 'AUCKLAND', code: 'AKL', date: todayStr, result: '----', period: '----' },
    { name: 'CHRISTCHURCH', code: 'CHC', date: yesterdayStr, result: '----', period: '----' },
    { name: 'WELLINGTON', code: 'WLG', date: yesterdayStr, result: '----', period: '----' },
    { name: 'HAMILTON', code: 'HML', date: yesterdayStr, result: '----', period: '----' },
    { name: 'TAURANGA', code: 'TRG', date: yesterdayStr, result: '----', period: '----' },
    { name: 'DUNEDIN', code: 'DND', date: yesterdayStr, result: '----', period: '----' },
    { name: 'MEDELLIN', code: 'MDL', date: yesterdayStr, result: '----', period: '----' },
    { name: 'EMERLAD', code: 'EMR', date: yesterdayStr, result: '----', period: '----' },
    { name: 'PRAGUE', code: 'PRG', date: yesterdayStr, result: '----', period: '----' },
    { name: 'SEATTLE', code: 'STL', date: yesterdayStr, result: '----', period: '----' },
    { name: 'BULLSEYE', code: 'BLY', date: yesterdayStr, result: '----', period: '----' }
  ];
}

export async function initLanding() {
  auth.updateHeaderAuthUI();
  setupSearchFilter();
  setupShowMoreButton();
  await loadMarkets();
}

async function loadMarkets() {
  const container = document.getElementById('hasil-grid-container');
  if (!container) return;

  try {
    const res = await api.get('/public/markets').catch(() => api.get('/member-api/markets'));
    const fetched = res.items || res.data || res || [];

    if (Array.isArray(fetched) && fetched.length > 0) {
      // Merge with default list to guarantee clean labels and real numbers
      const defaults = generateDefaultResults();
      marketsList = defaults.map(def => {
        const found = fetched.find(f =>
          f.code?.toUpperCase() === def.code ||
          f.slug?.toLowerCase().includes(def.name.toLowerCase().replace(/\s+/g, '-')) ||
          f.name?.toLowerCase().includes(def.name.toLowerCase())
        );
        return {
          name: def.name,
          code: def.code,
          date: found?.drawDate ? formatDateID(found.drawDate) : def.date,
          result: (found?.result && /^\d{3,6}$/.test(found.result)) ? found.result : def.result,
          period: found?.period || def.period
        };
      });
    } else {
      marketsList = generateDefaultResults();
    }
  } catch (err) {
    console.warn('API connection fallback, using default pool list');
    marketsList = generateDefaultResults();
  }

  renderHasilGrid(marketsList);
}

function formatDateID(dateStr) {
  if (!dateStr) return '08-09-2026';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function renderHasilGrid(items) {
  const container = document.getElementById('hasil-grid-container');
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: #a1a1aa;">
        Pasaran tidak ditemukan. Coba ketik kata kunci lain.
      </div>
    `;
    return;
  }

  const displayItems = isExpanded ? items : items.slice(0, 12);

  container.innerHTML = displayItems.map(m => `
    <div class="hasil-card fade-in">
      <div class="hasil-card-badge" title="${m.name}">
        ${m.name}
      </div>
      <div class="hasil-card-body">
        <span class="hasil-card-date">${m.date || '08-09-2026'}</span>
        <span class="hasil-card-number">${m.result}</span>
        <a href="${auth.isLoggedIn() ? '/market-play.html?code=' + m.code : '#login'}" 
           class="hasil-card-action"
           onclick="${auth.isLoggedIn() ? '' : 'window.openLoginModal(event)'}">
          Pasang Angka →
        </a>
      </div>
    </div>
  `).join('');
}

function setupSearchFilter() {
  const searchInput = document.getElementById('search-pasaran-input');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      renderHasilGrid(marketsList);
      return;
    }
    const filtered = marketsList.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.code.toLowerCase().includes(q)
    );
    renderHasilGrid(filtered);
  });
}

function setupShowMoreButton() {
  const btn = document.getElementById('btn-show-more');
  if (!btn) return;

  btn.addEventListener('click', () => {
    isExpanded = !isExpanded;
    btn.textContent = isExpanded ? 'Tampilkan Lebih Sedikit' : 'Show More Results';
    const searchInput = document.getElementById('search-pasaran-input');
    const q = searchInput?.value?.trim()?.toLowerCase() || '';

    if (q) {
      const filtered = marketsList.filter(m => m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q));
      renderHasilGrid(filtered);
    } else {
      renderHasilGrid(marketsList);
    }
  });
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

// Auto init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLanding);
} else {
  initLanding();
}
