/**
 * Gasterus v3 — Transaction (Deposit & Withdrawal) Logic
 */

import api from './api.js';
import auth from './auth.js';
import { formatRupiah, formatDateTime, showToast } from './utils.js';

function generateIdempotencyKey() {
  return `tx_${Date.now()}_${Math.random().toString(36).substring(2, 12)}_${Math.random().toString(36).substring(2, 8)}`;
}

export async function initDeposit() {
  if (!auth.isLoggedIn()) {
    window.location.href = '/index.html';
    return;
  }
  // Fetch fresh user data from server, then update UI
  try { await auth.fetchMe(); } catch (e) { /* use cached */ }
  auth.updateHeaderAuthUI();
  updateDepositUserBar();
  setupNominalPresets('deposit-amount-input');
  setupNominalPresets('qris-amount-input');
  await loadPaymentMethods();
  setupDepositForm();
  setupQrisDepositForm();
  await loadTransactionHistory('DEPOSIT');
}

function updateDepositUserBar() {
  const user = auth.getUser();
  if (!user) return;
  const nameEl = document.querySelector('.user-display-name');
  const balanceEl = document.querySelector('.user-display-balance');
  if (nameEl) nameEl.textContent = user.username || 'Member';
  if (balanceEl) {
    const bal = Number(user.balance || user.wallet?.balance || 0);
    balanceEl.textContent = new Intl.NumberFormat('id-ID').format(bal);
  }
}

export async function initWithdraw() {
  if (!auth.isLoggedIn()) {
    window.location.href = '/index.html';
    return;
  }
  // Fetch fresh user data from server, then update UI
  try { await auth.fetchMe(); } catch (e) { /* use cached */ }
  auth.updateHeaderAuthUI();
  updateDepositUserBar();
  setupNominalPresets('withdraw-amount-input');
  setupWithdrawForm();
  await loadTransactionHistory('WITHDRAW');
}

function setupNominalPresets(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  // Scope preset buttons to the same form/container as the target input
  const container = input.closest('form') || input.closest('.deposit-form-container');
  if (!container) return;

  container.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-value');
      if (val) {
        input.value = val;
        // Visual feedback - only within the same container
        container.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });
  });
}

async function loadPaymentMethods() {
  const selectEl = document.getElementById('payment-method-select');
  if (!selectEl) return;

  // Fallback bank yang valid agar form deposit tidak error saat endpoint down
  const fallbackMethods = [
    { id: 'bca', name: 'BCA', account_number: '0821-xxxx-xxxx', account_name: 'PT GASTERUS INDO NUSANTARA' },
    { id: 'mandiri', name: 'Mandiri', account_number: '1234-xxxx-xxxx', account_name: 'PT GASTERUS INDO NUSANTARA' },
    { id: 'qris', name: 'QRIS', account_number: '', account_name: 'QRIS GASTERUS' }
  ];

  let methods = fallbackMethods;
  try {
    const res = await api.get('/member/payment-methods');
    if (Array.isArray(res) && res.length > 0) {
      methods = res;
    } else {
      console.warn('Payment methods endpoint returned empty array, using fallback');
    }
  } catch (err) {
    console.warn('Payment methods endpoint error, using fallback bank options', err);
  }

  selectEl.innerHTML = methods.map(m => `
    <option value="${m.id}"
      data-acc="${m.account_number || ''}"
      data-name="${m.account_name || ''}">
      ${m.name} (${m.account_number ? m.account_number : 'QRIS'})
    </option>
  `).join('');

  selectEl.addEventListener('change', updateDestinationBankInfo);
  updateDestinationBankInfo();
}

function updateDestinationBankInfo() {
  const select = document.getElementById('payment-method-select');
  const destName = document.getElementById('dest-bank-name');
  const destAcc = document.getElementById('dest-bank-account');
  const destHolder = document.getElementById('dest-account-holder');

  if (!select || !select.selectedOptions[0]) return;
  const opt = select.selectedOptions[0];

  if (destName) destName.textContent = opt.text.split('(')[0].trim();
  if (destAcc) destAcc.textContent = opt.getAttribute('data-acc') || '0821-xxxx-xxxx';
  if (destHolder) destHolder.textContent = opt.getAttribute('data-name') || 'PT GASTERUS INDO NUSANTARA';
}

function setupDepositForm() {
  const form = document.getElementById('deposit-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = Number(form.amount.value);
    const methodId = form.paymentMethodId?.value;
    const note = form.note?.value?.trim() || '';

    if (!amount || amount < 10000) {
      showToast('Jumlah minimal deposit adalah Rp 10.000.', 'warning');
      return;
    }

    const payload = {
      requestType: 'DEPOSIT',
      amount,
      paymentMethodId: methodId || null,
      idempotencyKey: generateIdempotencyKey(),
      note: note || undefined
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Mengirim Permintaan...';

      /* QRIS auto deposit: generate dynamic QR + auto credit via webhook.
         Falls back to the legacy manual flow when the endpoint is unavailable. */
      const methodText = form.paymentMethodId?.selectedOptions?.[0]?.textContent || '';
      if (/QRIS/i.test(methodText)) {
        try {
          const res = await api.post('/member/qris/create-order', { amount, idempotencyKey: payload.idempotencyKey });
          const order = (res && res.data) ? res.data : res;
          if (order && order.orderId) {
            openQrisModal(order, form);
            return;
          }
        } catch (qrisErr) {
          console.warn('QRIS auto deposit unavailable, using manual flow', qrisErr);
          showToast('Mode QRIS otomatis tidak tersedia, permintaan dikirim manual.', 'warning');
        }
      }

      await api.post('/member/wallet-requests', payload);
      showToast('Permintaan deposit telah terkirim! Admin akan memproses segera.', 'success');
      form.reset();
      await loadTransactionHistory('DEPOSIT');
    } catch (err) {
      showToast(err.message || 'Gagal mengirim permintaan deposit.', 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Kirim Konfirmasi Deposit';
    }
  });
}

function setupQrisDepositForm() {
  const form = document.getElementById('qris-deposit-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = Number(form.amount.value);

    if (!amount || amount < 10000) {
      showToast('Jumlah minimal deposit QRIS adalah Rp 10.000.', 'warning');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Membuat QRIS...';

      const idempotencyKey = generateIdempotencyKey();
      const res = await api.post('/member/qris/create-order', { amount, idempotencyKey });
      const order = (res && res.data) ? res.data : res;
      if (order && order.orderId) {
        openQrisModal(order, form);
      } else {
        throw new Error('Gagal membuat order QRIS.');
      }
    } catch (qrisErr) {
      console.warn('QRIS auto deposit unavailable', qrisErr);
      // Fallback: submit as manual deposit request
      try {
        const payload = {
          requestType: 'DEPOSIT',
          amount,
          paymentMethodId: null,
          idempotencyKey: generateIdempotencyKey(),
          note: 'QRIS (manual)'
        };
        await api.post('/member/wallet-requests', payload);
        showToast('Mode QRIS otomatis tidak tersedia, permintaan dikirim manual. Admin akan memproses segera.', 'warning');
        form.reset();
        await loadTransactionHistory('DEPOSIT');
      } catch (err) {
        showToast(qrisErr.message || err.message || 'Gagal membuat deposit QRIS.', 'danger');
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Bayar dengan QRIS';
    }
  });
}

function setupWithdrawForm() {
  const form = document.getElementById('withdraw-form');
  if (!form) return;

  const user = auth.getUser();
  if (user) {
    const bankInfoEl = document.getElementById('member-bank-info');
    if (bankInfoEl) {
      bankInfoEl.textContent = `${user.bankName || 'BCA'} - ${user.accountNumber || 'xxxx'} (a/n ${user.accountName || user.username})`;
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = Number(form.amount.value);
    const password = form.password.value;

    if (!amount || amount < 50000) {
      showToast('Minimal penarikan dana adalah Rp 50.000.', 'warning');
      return;
    }

    if (!password) {
      showToast('Masukkan kata sandi akun untuk verifikasi keamanan.', 'warning');
      return;
    }

    const payload = {
      requestType: 'WITHDRAW',
      amount,
      authorizationPassword: password,
      idempotencyKey: generateIdempotencyKey()
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Memproses Penarikan...';

      await api.post('/member/wallet-requests', payload);
      showToast('Permintaan penarikan dana berhasil diajukan.', 'success');
      form.reset();
      await auth.fetchMe();
      auth.updateHeaderAuthUI();
      await loadTransactionHistory('WITHDRAW');
    } catch (err) {
      showToast(err.message || 'Gagal mengajukan penarikan dana.', 'danger');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Tarik Dana Sekarang';
    }
  });
}

async function loadTransactionHistory(type) {
  const tbody = document.getElementById('tx-history-tbody');
  if (!tbody) return;

  try {
    const list = await api.get('/member/wallet-requests');
    const filtered = (Array.isArray(list) ? list : []).filter(item => item.requestType === type);

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">Belum ada riwayat pengajuan ${type.toLowerCase()}.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(item => {
      let badge = '<span class="badge badge-warning">PENDING</span>';
      if (item.status === 'APPROVED' || item.status === 'SETTLED') badge = '<span class="badge badge-success">BERHASIL</span>';
      else if (item.status === 'REJECTED') badge = '<span class="badge badge-danger">DITOLAK</span>';

      return `
        <tr>
          <td>${formatDateTime(item.createdAt)}</td>
          <td style="font-weight:700; color:var(--text-gold);">${formatRupiah(item.amount)}</td>
          <td>${badge}</td>
          <td style="font-size:0.8rem; color:var(--text-secondary);">${item.note || item.rejectionReason || '-'}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Belum ada data riwayat transaksi.</td></tr>`;
  }
}

/* ============================================================
   QRIS Auto Deposit Modal — dynamic QR + polling until payment
   is confirmed by the provider webhook (balance auto credited).
   ============================================================ */
let _qrisPollTimer = null;

function openQrisModal(order, form) {
  closeQrisModal();

  const auto = order.settleMode === 'AUTO';
  // Use static QRIS barcode image with cache-buster
  const qrSrc = '/assets/qris-barcode.png?v=20260914-qris-fixed';

  const overlay = document.createElement('div');
  overlay.id = 'qris-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(2,8,20,.82);display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.innerHTML = `
    <div style="background:#0f1c30;border:1px solid #2c405a;border-radius:16px;max-width:360px;width:100%;padding:22px;text-align:center;color:#eef3f8;font-family:Inter,Arial,sans-serif;">
      <div style="font-weight:800;font-size:1.05rem;margin-bottom:4px;">Scan QRIS untuk Deposit</div>
      <div style="font-size:.8rem;color:#92a2b6;margin-bottom:14px;">Nominal: <strong style="color:#e2b84f;">Rp ${Number(order.amount).toLocaleString('id-ID')}</strong></div>
      <div id="qris-image-box" style="background:#fff;border-radius:12px;padding:12px;display:inline-block;min-width:260px;min-height:260px;line-height:260px;">
        ${qrSrc ? `<img src="${qrSrc}" alt="QRIS" style="width:260px;height:260px;display:inline-block;vertical-align:middle;">` : '<span style="font-size:.8rem;color:#333;">QRIS tidak tersedia</span>'}
      </div>
      <div id="qris-status" style="margin-top:14px;font-size:.85rem;color:#f5dc8a;">⏳ Menunggu pembayaran…</div>
      <div id="qris-timer" style="margin-top:4px;font-size:.75rem;color:#92a2b6;"></div>
      <button id="qris-close-btn" type="button" style="margin-top:16px;padding:9px 22px;border-radius:8px;border:1px solid #405570;background:#12243a;color:#fff;cursor:pointer;font-weight:700;">Tutup</button>
      ${auto ? '' : '<div style="margin-top:10px;font-size:.72rem;color:#92a2b6;">Saldo akan masuk setelah admin mengonfirmasi pembayaran Anda.</div>'}
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('qris-close-btn').addEventListener('click', closeQrisModal);

  // Countdown
  const expiresAt = new Date(order.expiresAt).getTime();
  const timerEl = document.getElementById('qris-timer');
  const tick = () => {
    const left = expiresAt - Date.now();
    if (left <= 0) { if (timerEl) timerEl.textContent = 'Kedaluwarsa.'; return; }
    const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    if (timerEl) timerEl.textContent = `Berlaku ${m}:${String(s).padStart(2, '0')} menit`;
  };
  tick();
  const countdown = setInterval(tick, 1000);
  overlay._countdown = countdown;

  // Poll status every 3s until PAID / EXPIRED / closed
  _qrisPollTimer = setInterval(async () => {
    try {
      const res = await api.get(`/member/qris/${order.orderId}/status`);
      const st = (res && res.data) ? res.data : res;
      const statusEl = document.getElementById('qris-status');
      if (!statusEl) return;
      if (st.balanceCredited || st.status === 'PAID') {
        statusEl.textContent = '✅ Pembayaran diterima! Saldo telah masuk.';
        statusEl.style.color = '#29b56d';
        if (overlay._countdown) clearInterval(overlay._countdown);
        clearInterval(_qrisPollTimer); _qrisPollTimer = null;
        setTimeout(async () => {
          closeQrisModal();
          try { await auth.fetchMe(); auth.updateHeaderAuthUI(); } catch (e) { /* ignore */ }
          await loadTransactionHistory('DEPOSIT');
          showToast('Deposit berhasil! Saldo telah ditambahkan.', 'success');
        }, 1800);
      } else if (st.status === 'EXPIRED') {
        statusEl.textContent = '⚠️ Transaksi kedaluwarsa. Silakan buat deposit baru.';
        statusEl.style.color = '#df5a62';
        if (overlay._countdown) clearInterval(overlay._countdown);
        clearInterval(_qrisPollTimer); _qrisPollTimer = null;
      }
    } catch (e) { /* keep polling; transient network errors are ignored */ }
  }, 3000);
}

function closeQrisModal() {
  if (_qrisPollTimer) { clearInterval(_qrisPollTimer); _qrisPollTimer = null; }
  const existing = document.getElementById('qris-modal-overlay');
  if (existing && existing._countdown) clearInterval(existing._countdown);
  if (existing) existing.remove();
}

