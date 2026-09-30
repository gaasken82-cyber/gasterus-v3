/**
 * Gasterus v3 — Market Betting / TOTO Logic
 */

import api from './api.js';
import auth from './auth.js';
import { formatNumber, formatRupiah, getTimeRemaining, showToast, escapeHtml } from './utils.js';

// Generate idempotency key yang konsisten dan unik per kiriman
function generateIdempotencyKey() {
  return `mp_${Date.now()}_${Math.random().toString(36).substring(2, 12)}_${Math.random().toString(36).substring(2, 8)}`;
}

let currentMarket = null;
let currentMarketConfig = null;
let betRows = [];
let rowIdCounter = 1;

// Pasar hanya boleh dianggap bisa dipertaruhkan bila backend memang mengirim
// bettingStatus OPEN, periode terisi, dan waktu tutup masih di masa depan.
// Tanpa ketiga syarat itu, pasar ditampilkan tertutup. Tidak ada nilai
// periode maupun waktu tutup yang dibuat di sisi klien.
function isMarketBettable(market, now = Date.now()) {
  if (!market || typeof market !== 'object') return false;
  if (market.available === false) return false;
  if (String(market.bettingStatus || '').toUpperCase() !== 'OPEN') return false;
  if (!String(market.period || '').trim()) return false;
  const closeMs = Date.parse(String(market.closeAt || ''));
  return Number.isFinite(closeMs) && closeMs > now;
}

function isMarketClosed(market) {
  const status = String(market?.bettingStatus || '').toUpperCase();
  return status === 'CLOSED' || status === 'SUSPENDED';
}

// Notice di bawah header bet slip. Tampil hanya ketika belum ada pasaran yang
// dipilih (halaman dibuka tanpa ?code=) supaya member tahu harus lewat tombol
// "BET DISINI" dulu, dan bukan mengira daftar game-nya kosong.
function setNoMarketNotice(show) {
  const el = document.getElementById('bet-no-market-notice');
  if (el) el.hidden = !show;
}

export async function initMarketPlay() {
  if (!auth.isLoggedIn()) {
    window.location.href = '/index.html';
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const marketCode = urlParams.get('code') || urlParams.get('market');
  if (!marketCode) {
    currentMarketConfig = null;
    currentMarket = {
      name: 'Pasaran tidak dipilih',
      available: false,
      bettingStatus: 'UNAVAILABLE',
      period: null,
      closeAt: null
    };
    updateMarketHeaderUI(currentMarket);
    setNoMarketNotice(true);
    setBettingControlsDisabled(true);
    startCountdown();
    return;
  }

  await loadMarketInfo(marketCode);
  initBetRows();
  setupEventListeners();
  setBettingControlsDisabled(!isMarketBettable(currentMarket));
  startCountdown();
}

// Fail-closed: bila API tidak dapat diakses, pasar ditampilkan sebagai tidak
// tersedia. Angka periode, waktu tutup, dan aturan pembayaran tidak pernah
// dibuat di klien karena semuanya akan disalahartikan member sebagai data
// betting yang sah.
async function loadMarketInfo(code) {
  try {
    const res = await api.get(`/member/betting-markets/${encodeURIComponent(code)}`);
    if (!res || typeof res !== 'object' || Array.isArray(res)) {
      throw new Error('Konfigurasi pasar tidak dapat dibaca');
    }
    currentMarketConfig = res;
    currentMarket = res;
    updateMarketHeaderUI(res);
    setNoMarketNotice(false);
    return true;
  } catch (err) {
    console.warn('Data pasar tidak dapat dimuat; pasar ditampilkan tertutup.', err);
    currentMarketConfig = null;
    currentMarket = {
      name: 'Pasaran sedang tidak tersedia',
      code: String(code || '').toUpperCase(),
      available: false,
      bettingStatus: 'UNAVAILABLE',
      period: null,
      closeAt: null
    };
    updateMarketHeaderUI(currentMarket);
    setNoMarketNotice(true);
    return false;
  }
}

function setBettingControlsDisabled(disabled) {
  document.querySelectorAll('#bet-rows-container input, #bet-rows-container select, #bet-rows-container button').forEach(control => {
    control.disabled = disabled;
  });
  const addRowBtn = document.getElementById('btn-add-row');
  if (addRowBtn) addRowBtn.disabled = disabled;
  const submitBtn = document.getElementById('btn-submit-bet');
  if (submitBtn) {
    submitBtn.disabled = disabled;
    submitBtn.textContent = disabled ? 'Pasaran tidak tersedia' : 'Konfirmasi & Pasang';
  }
}

function updateMarketHeaderUI(m) {
  const titleEl = document.getElementById('market-title');
  const periodEl = document.getElementById('market-period');
  const statusEl = document.getElementById('market-status');
  const timerEl = document.getElementById('market-countdown');
  const unavailable = m?.available === false || String(m?.bettingStatus || '').toUpperCase() === 'UNAVAILABLE';
  const open = isMarketBettable(m);

  if (titleEl) titleEl.textContent = unavailable ? 'Pasaran sedang tidak tersedia' : (m?.name || '-');
  if (periodEl) periodEl.textContent = m?.period ? `#${m.period}` : '-';
  if (statusEl) {
    statusEl.textContent = unavailable ? 'TIDAK TERSEDIA' : (open ? 'BUKA' : (isMarketClosed(m) ? 'TUTUP' : 'TIDAK TERSEDIA'));
    statusEl.className = open ? 'badge badge-success' : 'badge badge-danger';
  }
  if (timerEl && (unavailable || !m?.closeAt)) timerEl.textContent = 'TIDAK TERSEDIA';
}

function startCountdown() {
  setInterval(() => {
    const timerEl = document.getElementById('market-countdown');
    if (!timerEl) return;
    if (!isMarketBettable(currentMarket)) {
      timerEl.textContent = 'TIDAK TERSEDIA';
      return;
    }
    const t = getTimeRemaining(currentMarket.closeAt);
    if (t.expired) {
      timerEl.textContent = '00:00:00 (Tutup)';
      // Saat waktu tutup terlampaui, form wager langsung dimatikan agar member
      // tidak bisa mengirim tiket pada pasar yang sudah tertutup.
      setBettingControlsDisabled(true);
      if (currentMarket) currentMarket.bettingStatus = 'CLOSED';
      updateMarketHeaderUI(currentMarket);
    } else {
      const hh = String(t.hours).padStart(2, '0');
      const mm = String(t.minutes).padStart(2, '0');
      const ss = String(t.seconds).padStart(2, '0');
      timerEl.textContent = `${hh}:${mm}:${ss}`;
    }
  }, 1000);
}

// Katalog game diambil dari config pasar yang dikirim backend, bukan dari daftar
// hardcode di klien. Backend hanya mengirim game yang enabled + engineReady, jadi
// operator cukup membuka/tutup game lewat lottery-control tanpa menyentuh frontend.
const AUTO_DIGIT_GAMES = [['STRAIGHT_4D', 4], ['STRAIGHT_3D', 3], ['STRAIGHT_2D', 2]];

function enabledGames() {
  const games = Array.isArray(currentMarketConfig?.games) ? currentMarketConfig.games : [];
  return games.filter(g => g && g.enabled && g.engineReady && g.uiMode && g.uiMode !== 'unsupported');
}

function gameByCode(code) {
  return enabledGames().find(g => g.code === code) || null;
}

function minStake() {
  const n = Number(currentMarketConfig?.minStake);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

function autoGameCode(digits) {
  const hit = AUTO_DIGIT_GAMES.find(([, length]) => length === digits);
  return hit ? hit[0] : '';
}

// Game bolak-balik (urut bebas) menyimpan digit terurut supaya "21" dan "12"
// dianggap satu pilihan sama, persis seperti normalizeLotterySelection di backend.
function normalizeForGame(game, value) {
  const raw = String(value ?? '').trim();
  if (!game) return raw;
  if (game.uiMode === 'jitu') {
    const [position, digit] = raw.split(':');
    return position && digit ? `${position}:${digit}` : '';
  }
  if (game.uiMode === 'digits' || game.uiMode === 'shio') {
    const digits = raw.replace(/\D/g, '');
    return game.unordered ? digits.split('').sort().join('') : digits;
  }
  return raw.toUpperCase();
}

function isSelectionComplete(game, value) {
  const selection = String(value || '');
  if (!selection) return false;
  if (!game) return /^\d{2,4}$/.test(selection);
  if (game.uiMode === 'digits') return new RegExp(`^\\d{${game.inputDigits}}$`).test(selection);
  if (game.uiMode === 'shio') return /^(?:[1-9]|1[0-2])$/.test(selection);
  if (game.uiMode === 'jitu') return /^[^:]+:[0-9]$/.test(selection);
  if (game.uiMode === 'choice') return (game.choices || []).includes(selection);
  if (game.uiMode === 'positionChoice') {
    const [position, choice] = selection.split(':');
    return (game.positions || []).includes(position) && (game.choices || []).includes(choice);
  }
  if (game.uiMode === 'combination') {
    const [position, size, parity] = selection.split(':');
    return (game.positions || []).includes(position) && (game.sizes || []).includes(size) && (game.parities || []).includes(parity);
  }
  return false;
}

// Baris dengan gameCode AUTO memakai game yang ditebak dari jumlah digit, sama
// seperti yang dikirim ke backend.
function resolveRowGame(r) {
  if (r.gameCode && r.gameCode !== 'AUTO') return gameByCode(r.gameCode);
  return gameByCode(autoGameCode(String(r.selection || '').length));
}

// Kode game yang benar-benar dikirim ke backend. Selalu konkret: kalau config pasar
// belum memuat katalog game (mis. backend versi lama), baris tetap memakai game
// straight berdasarkan jumlah digit daripada mengirim literal "AUTO" yang pasti ditolak.
function rowGameCode(r) {
  return resolveRowGame(r)?.code || autoGameCode(String(r.selection || '').length) || 'STRAIGHT_4D';
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
    stake: minStake() * 10,
    gameCode: 'AUTO'
  });
  renderRows();
}

function removeRow(id) {
  if (betRows.length <= 1) return;
  betRows = betRows.filter(r => r.id !== id);
  renderRows();
}

function gameOptionList(selected) {
  const options = [`<option value="AUTO"${selected === 'AUTO' ? ' selected' : ''}>Auto Detect</option>`];
  for (const g of enabledGames()) {
    const disc = Number(g.discountPercent || 0);
    const mult = Number(g.payoutMultiplier || 0);
    const suffix = `${disc ? `Disc ${disc}%` : ''}${mult ? `x${mult}` : ''}`.trim();
    options.push(`<option value="${escapeHtml(g.code)}"${g.code === selected ? ' selected' : ''}>${escapeHtml(g.label)}${suffix ? ` (${suffix})` : ''}</option>`);
  }
  return options.join('');
}

function rowField(r) {
  const game = gameByCode(r.gameCode);
  const inputStyle = 'text-align:center; font-weight:700; letter-spacing:2px;';
  if (!game || game.uiMode === 'digits' || game.uiMode === 'shio') {
    const digits = game ? (game.uiMode === 'shio' ? 2 : game.inputDigits) : 4;
    const placeholder = game ? (game.uiMode === 'shio' ? 'Shio 1-12' : `Angka ${digits}D`) : 'Angka 2D/3D/4D';
    return `<input type="text" class="form-control bet-selection" placeholder="${escapeHtml(placeholder)}" maxlength="${digits}" value="${escapeHtml(r.selection)}" style="${inputStyle}">`;
  }
  const parts = String(r.selection || '').split(':');
  const chip = (key, values, current) => `<select class="form-control bet-opt" data-key="${key}" style="max-width:104px;">${(values || []).map(v => `<option value="${escapeHtml(v)}"${v === current ? ' selected' : ''}>${escapeHtml(v)}</option>`).join('')}</select>`;
  let inner = '';
  if (Array.isArray(game.positions) && game.uiMode !== 'choice') inner += chip(0, game.positions, parts[0] || game.positions[0]);
  if (game.uiMode === 'choice') inner += chip(0, game.choices, parts[0] || (game.choices || [])[0]);
  if (game.uiMode === 'positionChoice') inner += chip(1, game.choices, parts[1] || (game.choices || [])[0]);
  if (game.uiMode === 'combination') {
    inner += chip(1, game.sizes, parts[1] || (game.sizes || [])[0]);
    inner += chip(2, game.parities, parts[2] || (game.parities || [])[0]);
  }
  if (game.uiMode === 'jitu') inner += `<input type="text" class="form-control bet-opt-digit" data-key="1" maxlength="1" inputmode="numeric" placeholder="digit" value="${escapeHtml(parts[1] || '')}" style="max-width:68px; text-align:center;">`;
  return `<span class="bet-extras" style="display:flex; gap:6px; align-items:center; flex:1; min-width:0;">${inner}</span>`;
}

function renderRows() {
  const container = document.getElementById('bet-rows-container');
  if (!container) return;
  const stakeMin = minStake();

  container.innerHTML = betRows.map((r, idx) => `
    <div class="bet-row" data-id="${Number(r.id)}">
      <span style="font-size:0.8rem; color:var(--text-muted); text-align:center;">${idx + 1}</span>
      ${rowField(r)}
      <select class="form-control bet-game">${gameOptionList(r.gameCode)}</select>
      <input type="number" class="form-control bet-stake" placeholder="Taruhan (Rp)" step="100" min="${stakeMin}" value="${r.stake}" style="text-align:right;">
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

    // Baris dengan game berbasis pilihan (colok jitu, tengah/tepi, pola, kombinasi)
    // tidak memakai input teks: nilainya dirakit dari beberapa kontrol.
    const readExtras = () => {
      const parts = [];
      rowEl.querySelectorAll('.bet-opt').forEach(sel => {
        parts[Number(sel.getAttribute('data-key'))] = sel.value;
      });
      const digit = rowEl.querySelector('.bet-opt-digit');
      if (digit) parts[Number(digit.getAttribute('data-key'))] = digit.value.replace(/\D/g, '');
      const game = gameByCode(item.gameCode);
      item.selection = game ? normalizeForGame(game, parts.filter(v => v !== undefined && v !== '').join(':')) : '';
      calculateTotals();
    };

    if (selectionInput) {
      selectionInput.addEventListener('input', (e) => {
        const game = item.gameCode === 'AUTO' ? null : gameByCode(item.gameCode);
        item.selection = normalizeForGame(game, e.target.value.replace(/\D/g, ''));
        e.target.value = item.selection;
        // Auto detect hanya berlaku saat baris masih di mode AUTO. Kalau member
        // memilih game sendiri (mis. Colok 2D),digit yang diketik tidak boleh
        // menimpa pilihan itu.
        if (item.gameCode === 'AUTO') {
          const detected = autoGameCode(item.selection.length);
          if (detected) item.gameCode = detected;
          gameSelect.value = item.gameCode;
        }
        calculateTotals();
      });
    }

    rowEl.querySelectorAll('.bet-opt').forEach(sel => sel.addEventListener('change', readExtras));
    const extraDigit = rowEl.querySelector('.bet-opt-digit');
    if (extraDigit) {
      extraDigit.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
        readExtras();
      });
    }
    if (!selectionInput) readExtras();

    gameSelect.addEventListener('change', (e) => {
      item.gameCode = e.target.value;
      if (item.gameCode === 'AUTO') {
        const detected = autoGameCode(item.selection.length);
        if (detected) item.gameCode = detected;
      }
      // Kolom input berubah bentuk ketika game berganti (angka -> pilihan),
      // jadi baris digambar ulang.
      renderRows();
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
  const stakeMin = minStake();

  betRows.forEach(r => {
    const game = resolveRowGame(r);
    if (!isSelectionComplete(game, r.selection)) return;
    if (!(r.stake >= stakeMin)) return;
    validItemsCount++;
    totalGross += r.stake;
    // Diskon ikut game yang benar-benar dipilih, bukan lagi ditebak dari jumlah
    // digit — supaya total di layar sama dengan yang dihitung backend.
    const disc = Number(game?.discountPercent || 0) / 100;
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
  // Validasi memakai definisi game dari backend (panjang digit, mode input), bukan
  // daftar kode game yang ditulis manual di halaman ini.
  const stakeMin = minStake();
  const invalidRows = betRows
    .filter(r => r.selection && r.stake > 0)
    .filter(r => {
      const game = resolveRowGame(r);
      if (!isSelectionComplete(game, r.selection)) return true;
      if (r.stake < stakeMin) return true;
      // Cek duplikat selection per game (backend juga menolak sebagai BET_DUPLICATE_LINE).
      const sel = `${rowGameCode(r)}|${String(r.selection).toUpperCase()}`;
      return betRows.some(other =>
        other !== r &&
        other.selection &&
        `${rowGameCode(other)}|${String(other.selection).toUpperCase()}` === sel
      );
    });

  if (invalidRows.length > 0) {
    const label = r => `${r.selection} (${resolveRowGame(r)?.label || r.gameCode})`;
    const examples = invalidRows.slice(0, 3).map(label).join(', ');
    showToast(`Pilihan tidak valid, kembar, duplikat, atau di bawah min ${stakeMin}: ${examples}${invalidRows.length > 3 ? ' ...' : ''}`, 'danger');
    return;
  }

  const user = auth.getUser();
  // totalNet hanya ada sebagai return value calculateTotals() — ambil dari sana
  // (sebelumnya referensi langsung ke totalNet menyebabkan ReferenceError di
  // handleBetSubmit sehingga tombol submit TOTO tidak pernah mengirim request).
  const { totalNet } = calculateTotals();
  if (user && Number(user.balance ?? 0) < totalNet) {
    showToast('Saldo Anda tidak mencukupi untuk memasang taruhan ini.', 'danger');
    return;
  }

  const rows = betRows
    .filter(r => isSelectionComplete(resolveRowGame(r), r.selection) && r.stake >= stakeMin)
    .map(r => ({
      gameCode: rowGameCode(r),
      selection: r.selection,
      // amount = nominal bruto yang dimasukkan user.
      // Backend akan menghitung ulang stake setelah diskon via calculateLotteryPricing,
      // jadi kita tidak perlu kirim stake dari sini.
      amount: r.stake
    }));

  // Penjaga terakhir sebelum mengirim. Backend sudah menolak wager pada pasar
  // tertutup, tetapi pemeriksaan di sini mencegah request yang pasti ditolak dan
  // memastikan periode yang dikirim selalu berasal dari server.
  if (!isMarketBettable(currentMarket)) {
    showToast('Pasaran sedang tidak tersedia. Silakan coba lagi nanti.', 'danger');
    setBettingControlsDisabled(true);
    return;
  }
  if (!currentMarketConfig) {
    showToast('Data pasar belum termuat. Silakan muat ulang halaman.', 'danger');
    return;
  }

  const marketId = currentMarketConfig?.marketId
    || currentMarket?.marketId
    || currentMarket?.id
    || currentMarket?.slug;

  const payload = {
    marketId,
    period: currentMarketConfig?.period || currentMarket?.period,
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
