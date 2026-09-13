#!/usr/bin/env python3
"""Fix all pages using CSS modular (app-header, app-main, app-footer).
Menambahkan menu-toggle, navigation drawer, dan footer yang konsisten."""

import re
from pathlib import Path

BASE = Path(r"E:\gas terus 25\gasterus-v3\frontend")

# Daftar halaman yang menggunakan CSS modular
PAGES = [
    "market-play.html",
    "bet-history.html",
    "number-history.html",
    "promotion.html",
]

DRAWER_HTML = '''
  <!-- Navigation Drawer -->
  <div class="nav-drawer-backdrop" id="navBackdrop"></div>
  <nav class="nav-drawer" id="site-nav-drawer" aria-label="Main navigation">
    <div class="nav-drawer-head">
      <span class="nav-drawer-title">Menu</span>
      <button type="button" class="nav-drawer-close" data-nav-close aria-label="Tutup Menu">✕</button>
    </div>
    <div class="nav-drawer-body">
      <a class="nav-drawer-item" href="/index.html">Beranda</a>
      <a class="nav-drawer-item" href="/member.html">Togel &amp; Slot</a>
      <a class="nav-drawer-item" href="/sportsbook.html">Sportsbook</a>
      <a class="nav-drawer-item" href="/number-history.html">Result</a>
      <a class="nav-drawer-item" href="/bet-history.html">Riwayat Bet</a>
      <a class="nav-drawer-item" href="/deposit.html">Deposit</a>
      <a class="nav-drawer-item" href="/withdraw.html">Withdraw</a>
      <a class="nav-drawer-item" href="/promotion.html">Promo</a>
      <a class="nav-drawer-item" href="/referral.html">Referral</a>
      <div style="margin-top:16px; border-top:1px solid #1e293b; padding-top:12px;">
        <a class="nav-drawer-item" href="/rules.html">Cara Bermain</a>
        <a class="nav-drawer-item" href="/privacy.html">Privasi</a>
        <a class="nav-drawer-item" href="/terms.html">Ketentuan</a>
      </div>
    </div>
  </nav>
'''

NAV_JS = '''
  <script>
    (function () {
      function openNav() {
        var drawer = document.getElementById('site-nav-drawer');
        var backdrop = document.getElementById('navBackdrop');
        if (drawer) drawer.classList.add('open');
        if (backdrop) backdrop.classList.add('show');
        document.body.classList.add('nav-open');
      }
      function closeNav() {
        var drawer = document.getElementById('site-nav-drawer');
        var backdrop = document.getElementById('navBackdrop');
        if (drawer) drawer.classList.remove('open');
        if (backdrop) backdrop.classList.remove('show');
        document.body.classList.remove('nav-open');
      }
      document.querySelectorAll('[data-nav-open]').forEach(function (trigger) {
        trigger.addEventListener('click', function (e) { e.preventDefault(); openNav(); });
      });
      document.querySelectorAll('[data-nav-close]').forEach(function (el) {
        el.addEventListener('click', closeNav);
      });
      document.getElementById('navBackdrop')?.addEventListener('click', closeNav);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeNav();
      });
    })();
  </script>
'''

FOOTER_LINKS = '''
      <div class="footer-links">
        <a href="privacy.html">Privacy</a>
        <a href="responsible-play.html">Responsible Gaming</a>
        <a href="terms.html">Terms</a>
      </div>
'''

for page_name in PAGES:
    path = BASE / page_name
    html = path.read_text(encoding="utf-8", errors="replace")
    
    # 1. Tambah menu-toggle di header (jika belum ada)
    if 'data-nav-open' not in html:
        old_h = '<a href="/member.html" class="brand-logo">\n        GASTERUS <span class="logo-badge">V3</span>'
        new_h = '<button type="button" class="menu-toggle" data-nav-open aria-label="Menu">☰</button>\n      <a href="/member.html" class="brand-logo">\n        GASTERUS <span class="logo-badge">V3</span>'
        html = html.replace(old_h, new_h, 1)
    
    # 2. Hapus semua drawer yang ada (duplikat)
    html = re.sub(r'\s*<!-- Navigation Drawer -->.*?</nav>', '', html, flags=re.DOTALL)
    
    # 3. Sisipkan drawer sekali sebelum <main>
    html = html.replace('<main class="app-main">', DRAWER_HTML + '\n  <main class="app-main">', 1)
    
    # 4. Hapus duplikat nav JS dan tambahkan yang benar
    html = re.sub(r'\s*<script>\s*\(function \(\) \{\s*function openNav\(\)', '\n<script>\n    (function () {\n      function openNav()', html, flags=re.DOTALL)
    
    # 5. Tambahkan footer links (jika tidak ada)
    if 'footer-links' not in html and 'app-footer' in html:
        # Cari footer-bottom dan sisipkan links sebelum itu
        old_footer = '<div class="container footer-bottom">'
        new_footer = FOOTER_LINKS + '\n      <div class="container footer-bottom">'
        html = html.replace(old_footer, new_footer, 1)
    
    path.write_text(html, encoding="utf-8")
    print(f"OK - {page_name} fixed")

# Handle sportsbook.html (sudah punya sb-nav, tapi perlu drawer juga)
path = BASE / "sportsbook.html"
html = path.read_text(encoding="utf-8", errors="replace")
if 'data-nav-open' not in html:
    # sportsbook pakai struktur berbeda, skip drawer tapi pastikan ada
    print("INFO - sportsbook.html punya navigasi sendiri, dilewati")
else:
    print("OK - sportsbook.html already has nav")
