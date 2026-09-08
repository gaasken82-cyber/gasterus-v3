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
  auth.updateHeaderAuthUI();
  setupNominalPresets('deposit-amount-input');
  await loadPaymentMethods();
  setupDepositForm();
  await loadTransactionHistory('DEPOSIT');
}

export async function initWithdraw() {
  if (!auth.isLoggedIn()) {
    window.location.href = '/index.html';
    return;
  }
  auth.updateHeaderAuthUI();
  setupNominalPresets('withdraw-amount-input');
  setupWithdrawForm();
  await loadTransactionHistory('WITHDRAW');
}

function setupNominalPresets(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-value');
      if (val) {
        input.value = val;
      }
    });
  });
}

async function loadPaymentMethods() {
  const selectEl = document.getElementById('payment-method-select');
  if (!selectEl) return;

  try {
    const methods = await api.get('/member/payment-methods');
    if (Array.isArray(methods) && methods.length > 0) {
      selectEl.innerHTML = methods.map(m => `
        <option value="${m.id}" data-acc="${m.account_number || ''}" data-name="${m.account_name || ''}">
          ${m.name} (${m.account_number ? m.account_number : 'QRIS'})
        </option>
      `).join('');

      selectEl.addEventListener('change', updateDestinationBankInfo);
      updateDestinationBankInfo();
    }
  } catch (err) {
    console.warn('Payment methods endpoint error, using default bank options', err);
  }
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
