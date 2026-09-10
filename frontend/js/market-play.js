/**
 * Gasterus v3 — Market Betting / TOTO Logic
 */

import api from './api.js';
import auth from './auth.js';
import { formatNumber, formatRupiah, getTimeRemaining, showToast } from './utils.js';

// Generate idempotency key yang konsisten dan unik per kiriman
function generateIdempotencyKey() {
  return `mp_${Date.now()}_${Math.random().toString(36).substring(2, 12)}_${Math.random().toString(36).substring(2, 8)}`;
}

let currentMarket = null;
let currentMarketConfig = null;
let betRows = [];
let rowIdCounter = 1;

export async function initMarketPlay() {
  if (!auth.isLoggedIn()) {
    window.location.href = '/index.html';
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const marketCode = urlParams.get('code') || 'SGP';

  await loadMarketInfo(marketCode);
  initBetRows();
  setupEventListeners();
  startCountdown();
}

async function loadMarketInfo(code) {
  try {
    const res = await api.get(`/member/betting-markets/${encodeURIComponent(code)}`);
    currentMarketConfig = res;
    currentMarket = res;
    updateMarketHeaderUI(res);
  } catch (err) {
    console.warn('Unable to load live betting config, using fallback data', err);
    currentMarket = {
      name: code.toUpperCase() + ' POOLS',
      code: code.toUpperCase(),
      period: '2982',
      bettingStatus: 'OPEN',
      closeAt: new Date(Date.now() + 5400000).toISOString(),
      gameMap: {
        STRAIGHT_4D: { discount: 66, payoutMultiplier: 3000 },
        STRAIGHT_3D: { discount: 59, payoutMultiplier: 400 },
        STRAIGHT_2D: { discount: 29, payoutMultiplier: 70 }
      }
    };
    updateMarketHeaderUI(currentMarket);
  }
}

function updateMarketHeaderUI(m) {
  const titleEl = document.getElementById('market-title');
  const periodEl = document.getElementById('market-period');
  const statusEl = document.getElementById('market-status');

  if (titleEl) titleEl.textContent = m.name;
  if (periodEl) periodEl.textContent = `#${m.period || '-'}`;
  if (statusEl) {
    const isClosed = m.bettingStatus === 'CLOSED' || m.bettingStatus === 'SUSPENDED';
    statusEl.textContent = isClosed ? 'TUTUP' : 'BUKA';
    statusEl.className = isClosed ? 'badge badge-danger' : 'badge badge-success';
  }
}

function startCountdown() {
  setInterval(() => {
    const timerEl = document.getElementById('market-countdown');
    if (!timerEl || !currentMarket?.closeAt) return;
    const t = getTimeRemaining(currentMarket.closeAt);
    if (t.expired) {
      timerEl.textContent = '00:00:00 (Tutup)';
    } else {
      const hh = String(t.hours).padStart(2, '0');
      const mm = String(t.minutes).padStart(2, '0');
      const ss = String(t.seconds).padStart(2, '0');
      timerEl.textContent = `${hh}:${mm}:${ss}`;
    }
  }, 1000);
}

function initBetRows() {
  betRows = [];
  for (let i = 0; i < 5; i++) {
    addRow();
  }
}

function addRow() {
  const rowId = rowIdCounter++;
  betRows.push({
    id: rowId,
    selection: '',
    stake: 1000,
    gameCode: 'STRAIGHT_4D'
  });
  renderRows();
}

function removeRow(id) {
  if (betRows.length <= 1) return;
  betRows = betRows.filter(r => r.id !== id);
  renderRows();
}

function renderRows() {
  const container = document.getElementById('bet-rows-container');
  if (!container) return;

  container.innerHTML = betRows.map((r, idx) => `
    <div class="bet-row" data-id="${r.id}">
      <span style="font-size:0.8rem; color:var(--text-muted); text-align:center;">${idx + 1}</span>
      <input type="text" class="form-control bet-selection" placeholder="Angka (4D/3D/2D)" maxlength="4" value="${r.selection}" style="text-align:center; font-weight:700; letter-spacing:2px;">
      <select class="form-control bet-game">
        <option value="AUTO" ${r.gameCode === 'AUTO' ? 'selected' : ''}>Auto Detect</option>
        <option value="STRAIGHT_4D" ${r.gameCode === 'STRAIGHT_4D' ? 'selected' : ''}>4D (Disc 66%)</option>
        <option value="STRAIGHT_3D" ${r.gameCode === 'STRAIGHT_3D' ? 'selected' : ''}>3D (Disc 59%)</option>
        <option value="STRAIGHT_2D" ${r.gameCode === 'STRAIGHT_2D' ? 'selected' : ''}>2D (Disc 29%)</option>
      </select>
      <input type="number" class="form-control bet-stake" placeholder="Taruhan (Rp)" step="1000" min="1000" value="${r.stake}" style="text-align:right;">
      <button type="button" class="btn-remove-row" onclick="window.removeBetRow(${r.id})">&times;</button>
    </div>
  `).join('');

  bindRowInputs();
  calculateTotals();
}

function bindRowInputs() {
  document.querySelectorAll('.bet-row').forEach(rowEl => {
    const id = Number(rowEl.getAttribute('data-id'));
    const item = betRows.find(r => r.id === id);
    if (!item) return;

    const selectionInput = rowEl.querySelector('.bet-selection');
    const gameSelect = rowEl.querySelector('.bet-game');
    const stakeInput = rowEl.querySelector('.bet-stake');

    selectionInput.addEventListener('input', (e) => {
      item.selection = e.target.value.replace(/\D/g, '');
      e.target.value = item.selection;
      // Auto game detect
      if (item.selection.length === 4) item.gameCode = 'STRAIGHT_4D';
      else if (item.selection.length === 3) item.gameCode = 'STRAIGHT_3D';
      else if (item.selection.length === 2) item.gameCode = 'STRAIGHT_2D';
      gameSelect.value = item.gameCode;
      calculateTotals();
    });

    gameSelect.addEventListener('change', (e) => {
      item.gameCode = e.target.value;
      calculateTotals();
    });

    stakeInput.addEventListener('input', (e) => {
      item.stake = Math.max(0, Number(e.target.value) || 0);
      calculateTotals();
    });
  });
}

function calculateTotals() {
  let totalGross = 0;
  let totalDiscount = 0;
  let validItemsCount = 0;

  betRows.forEach(r => {
    if (!r.selection || r.selection.length < 2 || !r.stake) return;
    validItemsCount++;
    totalGross += r.stake;

    // Disc percentage
    let disc = 0;
    if (r.gameCode === 'STRAIGHT_4D' || r.selection.length === 4) disc = 0.66;
    else if (r.gameCode === 'STRAIGHT_3D' || r.selection.length === 3) disc = 0.59;
    else if (r.gameCode === 'STRAIGHT_2D' || r.selection.length === 2) disc = 0.29;

    totalDiscount += Math.round(r.stake * disc);
  });

  const totalNet = totalGross - totalDiscount;

  const countEl = document.getElementById('betslip-count');
  const grossEl = document.getElementById('betslip-gross');
  const discEl = document.getElementById('betslip-discount');
  const totalEl = document.getElementById('betslip-total');

  if (countEl) countEl.textContent = `${validItemsCount} Baris`;
  if (grossEl) grossEl.textContent = formatRupiah(totalGross);
  if (discEl) discEl.textContent = formatRupiah(totalDiscount);
  if (totalEl) totalEl.textContent = formatRupiah(totalNet);

  return { totalGross, totalDiscount, totalNet, validItemsCount };
}

function setupEventListeners() {
  window.removeBetRow = removeRow;

  const addRowBtn = document.getElementById('btn-add-row');
  if (addRowBtn) {
    addRowBtn.addEventListener('click', addRow);
  }

  const submitBtn = document.getElementById('btn-submit-bet');
  if (submitBtn) {
    submitBtn.addEventListener('click', handleBetSubmit);
  }
}

async function handleBetSubmit() {
  // Validasi format angka: hanya 2/3/4 digit angka murni (sesuai normalizeLotterySelection di backend)
  const invalidRows = betRows
    .filter(r => r.selection && r.selection.length >= 2 && r.stake > 0)
    .filter(r => {
      const gameCode = r.gameCode === 'AUTO'
        ? (r.selection.length === 4 ? 'STRAIGHT_4D' : r.selection.length === 3 ? 'STRAIGHT_3D' : 'STRAIGHT_2D')
        : r.gameCode;
      // Validasi: harus sesuai digit yang diharapkan untuk game code tsb
      const digitCount = {
        'STRAIGHT_4D': 4,
        'STRAIGHT_3D': 3,
        'STRAIGHT_2D': 2,
        'POSITION_2D_FRONT': 2,
        'POSITION_2D_MIDDLE': 2
      }[gameCode] || 4;
      // Hanya angka + panjang tepat
      if (!/^\d+$/.test(r.selection) || r.selection.length !== digitCount) {
        return true;
      }
      // Cek duplikat selection (backend juga validasi ini sebagai BET_DUPLICATE_LINE)
      const sel = r.selection.toUpperCase();
      return betRows.some(other =>
        other !== r &&
        other.selection &&
        other.selection.length >= 2 &&
        other.selection.toUpperCase() === sel
      );
    });

  if (invalidRows.length > 0) {
    const examples = invalidRows.slice(0, 3).map(r => `"${r.selection}" (${r.gameCode})`).join(', ');
    showToast(`Nomor tidak valid atau duplikat: ${examples}${invalidRows.length > 3 ? ' ...' : ''}`, 'danger');
    return;
  }

  const user = auth.getUser();
  if (user && user.balance < totalNet) {
    showToast('Saldo Anda tidak mencukupi untuk memasang taruhan ini.', 'danger');
    return;
  }

  const rows = betRows
    .filter(r => r.selection && r.selection.length >= 2 && r.stake > 0)
    .map(r => {
      const gameCode = r.gameCode === 'AUTO'
        ? (r.selection.length === 4 ? 'STRAIGHT_4D' : r.selection.length === 3 ? 'STRAIGHT_3D' : 'STRAIGHT_2D')
        : r.gameCode;
      return {
        gameCode,
        selection: r.selection,
        // amount = nominal bruto yang dimasukkan user.
        // Backend akan menghitung ulang stake setelah diskon via calculateLotteryPricing,
        // jadi kita tidak perlu kirim stake dari sini.
        amount: r.stake
      };
    });

  const marketId = currentMarketConfig?.marketId
    || currentMarket?.marketId
    || currentMarket?.id
    || currentMarket?.slug;

  const payload = {
    marketId,
    period: currentMarketConfig?.period || currentMarket?.period || undefined,
    rows,
    idempotencyKey: generateIdempotencyKey()
  };

  const submitBtn = document.getElementById('btn-submit-bet');
  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Memproses Taruhan...';

    await api.post('/member/bets', payload);
    showToast('Taruhan berhasil dipasang!', 'success');
    await auth.fetchMe();
    auth.updateHeaderAuthUI();

    setTimeout(() => {
      window.location.href = '/bet-history.html';
    }, 1000);
  } catch (err) {
    showToast(err.message || 'Gagal memasang taruhan.', 'danger');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Konfirmasi & Pasang Taruhan';
  }
}

// Auto init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMarketPlay);
} else {
  initMarketPlay();
}
