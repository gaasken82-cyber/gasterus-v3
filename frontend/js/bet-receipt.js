/**
 * Gasterus v3 — Bukti betting (printable receipt).
 *
 * Semua angka diambil dari server lewat /member/bets/:id/receipt. Halaman ini
 * tidak pernah menyusun nilai sendiri, sehingga bukti yang dicetak selalu sama
 * dengan data yang tercatat di server.
 */
import api from './api.js';
import auth from './auth.js';
import { formatRupiah, formatDateTime, escapeHtml } from './utils.js';

const esc = escapeHtml;

const STATUS_TONE = {
  SETTLED_WON: 'won',
  SETTLED_LOST: 'lost',
  VOID: 'lost',
  CANCELLED: 'lost',
  DRAFT: 'open',
  ACCEPTED: 'open',
  SETTLEMENT_PENDING: 'open'
};

const LINE_TONE = { true: 'won', false: 'lost' };

function pill(status) {
  const value = String(status || '-').toUpperCase();
  return `<span class="pill ${esc(STATUS_TONE[value] || 'open')}">${esc(value)}</span>`;
}

function lineRow(row) {
  return `<tr>
    <td class="num">${esc(row.no)}</td>
    <td>${esc(row.label)}<br><span class="muted">${esc(row.gameCode)}</span></td>
    <td class="num">${esc(row.selection)}</td>
    <td class="num">${formatRupiah(row.amount)}</td>
    <td class="num">${esc(row.discount)}%</td>
    <td class="num">${formatRupiah(row.stake)}</td>
    <td class="num">x${esc(row.payoutMultiplier)}</td>
    <td class="num">${formatRupiah(row.payout)}</td>
    <td><span class="pill ${esc(LINE_TONE[String(row.won) === 'true' ? 'true' : 'false'])}">${row.won ? 'MENANG' : 'KALAH'}</span></td>
  </tr>`;
}

function render(receipt) {
  const t = receipt.totals || {};
  return `
    <dl class="kv">
      <dt>No. Bukti</dt><dd>${esc(receipt.receiptNumber)}</dd>
      <dt>No. Invoice</dt><dd>${esc(receipt.invoice)}</dd>
      <dt>Pasaran</dt><dd>${esc(receipt.market?.name || '-')}</dd>
      <dt>Periode</dt><dd>${esc(receipt.market?.period || '-')}</dd>
      <dt>Hasil</dt><dd>${esc(receipt.market?.result || 'Belum keluar')}</dd>
      <dt>Status</dt><dd>${pill(receipt.status)}</dd>
      <dt>Dipasang</dt><dd>${esc(formatDateTime(receipt.placedAt) || '-')}</dd>
      <dt>Dibayar</dt><dd>${esc(formatDateTime(receipt.settledAt) || 'Belum diselesaikan')}</dd>
    </dl>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>No</th><th>Game</th><th>Pilihan</th><th>Nominal</th>
            <th>Diskon</th><th>Stake</th><th>Hadiah</th><th>Bayar</th><th>Hasil</th>
          </tr>
        </thead>
        <tbody>${(receipt.rows || []).map(lineRow).join('')}</tbody>
      </table>
    </div>
    <div class="totals">
      <span>Jumlah baris</span><strong>${esc(t.lineCount ?? 0)}</strong>
      <span>Total stake</span><strong>${formatRupiah(t.stake || 0)}</strong>
      <span>Total pembayaran</span><strong>${formatRupiah(t.payout || 0)}</strong>
      <span>Saldo sebelum</span><strong>${t.balanceBefore === null || t.balanceBefore === undefined ? '-' : formatRupiah(t.balanceBefore)}</strong>
      <span>Saldo sesudah</span><strong>${t.balanceAfter === null || t.balanceAfter === undefined ? '-' : formatRupiah(t.balanceAfter)}</strong>
    </div>`;
}

async function load() {
  const box = document.getElementById('receipt');
  const printBtn = document.getElementById('btn-print');
  const id = new URLSearchParams(window.location.search).get('id');
  if (printBtn) printBtn.addEventListener('click', () => window.print());
  if (!auth.isLoggedIn()) {
    box.textContent = 'Silakan masuk terlebih dahulu untuk membuka bukti.';
    return;
  }
  if (!id) {
    box.textContent = 'Nomor betting tidak ditemukan pada alamat halaman.';
    return;
  }
  try {
    const res = await api.get(`/member/bets/${encodeURIComponent(id)}/receipt`);
    box.innerHTML = render(res.data || res);
  } catch (err) {
    box.textContent = err.message || 'Bukti tidak dapat dimuat.';
  }
}

load();