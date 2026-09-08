/**
 * Gasterus v3 — General Utility Helpers
 */

export function formatRupiah(amount) {
  const n = Number(amount) || 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(n).replace('IDR', 'Rp');
}

export function formatNumber(num) {
  const n = Number(num) || 0;
  return new Intl.NumberFormat('id-ID').format(n);
}

export function formatDateTime(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function getTimeRemaining(targetDateStr) {
  if (!targetDateStr) return { total: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  const total = new Date(targetDateStr).getTime() - Date.now();
  if (total <= 0) return { total: 0, hours: 0, minutes: 0, seconds: 0, expired: true };

  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / 1000 / 60) % 60);
  const hours = Math.floor(total / (1000 * 60 * 60));

  return { total, hours, minutes, seconds, expired: false };
}

export function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const bgMap = {
    success: 'var(--status-success)',
    danger: 'var(--status-danger)',
    warning: 'var(--status-warning)',
    info: 'var(--bg-surface-elevated)'
  };

  toast.style.cssText = `
    background: ${bgMap[type] || bgMap.info};
    color: #fff;
    padding: 12px 20px;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    font-size: 0.875rem;
    font-weight: 500;
    opacity: 0;
    transform: translateY(-10px);
    transition: all 250ms ease-out;
    pointer-events: auto;
    border: 1px solid var(--border-subtle);
  `;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
