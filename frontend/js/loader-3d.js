/**
 * Gasterus v3 — 3D Brand Loader
 * Layar pembuka berlogo GASTERUS saat halaman dibuka.
 *
 * Prinsip:
 *  - Ditambahkan lewat satu tag <script>, tidak menyentuh markup/layout halaman.
 *  - Selalu hilang sendiri: lewat event load, atau batas waktu maksimal.
 *  - Tidak pernah menahan halaman kalau JavaScript gagal atau aset lambat.
 */

const MIN_MS = 420;   // tampilkan sedikit lama agar terbaca sebagai sungguhan
const MAX_MS = 2600;  // paksa hilang walau aset/network lambat

let overlay = null;
let hidden = false;

function buildOverlay() {
  const root = document.createElement('div');
  root.className = 'gasterus-loader';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-label', 'Memuat Gasterus');
  root.innerHTML = `
    <div class="gasterus-loader-ring"></div>
    <div class="gasterus-loader-ring gasterus-loader-ring--two"></div>
    <div class="gasterus-loader-ring gasterus-loader-ring--three"></div>
    <div class="gasterus-loader-glow"></div>
    <div class="gasterus-loader-cube">
      <span></span><span></span><span></span>
      <span></span><span></span><span></span>
    </div>
    <div class="gasterus-loader-logo">
      <img src="/assets/logo.png" alt="GASTERUS" width="132" height="132" decoding="async">
    </div>
    <div class="gasterus-loader-brand">GASTERUS</div>
    <div class="gasterus-loader-bar"><span></span></div>
  `;
  return root;
}

function hideLoader() {
  if (hidden || !overlay) return;
  hidden = true;
  overlay.classList.add('is-done');
  // Lepaskan dari DOM setelah transisi selesai supaya tidak menahan render.
  setTimeout(() => {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }, 600);
}

export function initGasterusLoader() {
  if (overlay || hidden) return;
  if (!document.body) return;

  try {
    overlay = buildOverlay();
    // Sisipkan sebagai anak pertama body: menutupi halaman tanpa mengubah
    // posisi elemen apa pun yang sudah ada.
    document.body.insertBefore(overlay, document.body.firstChild);
  } catch (error) {
    // Kalau gagal membuat overlay, halaman harus tetap jalan normal.
    overlay = null;
    console.warn('Gasterus loader gagal dibuat; halaman tetap dimuat normal', error);
    return;
  }

  if (document.readyState === 'complete') {
    setTimeout(hideLoader, MIN_MS);
    return;
  }

  const finish = () => setTimeout(hideLoader, MIN_MS);
  window.addEventListener('load', finish, { once: true });
  document.addEventListener('DOMContentLoaded', finish, { once: true });

  // Jaring pengaman: apa pun yang terjadi, loader pasti hilang.
  setTimeout(hideLoader, MAX_MS);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGasterusLoader, { once: true });
} else {
  initGasterusLoader();
}
