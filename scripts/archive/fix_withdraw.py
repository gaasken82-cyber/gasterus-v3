#!/usr/bin/env python3
"""Fix withdraw.html: inject navigation drawer before <main> and add nav JS before </body>."""

import re
from pathlib import Path

path = Path(r"E:\gas terus 25\gasterus-v3\frontend\withdraw.html")
html = path.read_text(encoding="utf-8")

drawer = """
  <!-- Navigation Drawer -->
  <div class="nav-drawer-backdrop" id="navBackdrop"></div>
  <nav class="nav-drawer" id="site-nav-drawer" aria-label="Main navigation">
    <div class="nav-drawer-head">
      <span class="nav-drawer-title">Menu</span>
      <button type="button" class="nav-drawer-close" data-nav-close aria-label="Tutup Menu">✕</button>
    </div>
    <div class="nav-drawer-body">
      <a class="nav-drawer-item" href="/index.html">🏠 Beranda</a>
      <a class="nav-drawer-item" href="/member.html">🎰 Togel &amp; Slot</a>
      <a class="nav-drawer-item" href="/sportsbook.html">⚽ Sportsbook</a>
      <a class="nav-drawer-item" href="/number-history.html">📊 Result</a>
      <a class="nav-drawer-item" href="/bet-history.html">📜 Riwayat Bet</a>
      <a class="nav-drawer-item" href="/deposit.html">💳 Deposit</a>
      <a class="nav-drawer-item" href="/withdraw.html">💸 Withdraw</a>
      <a class="nav-drawer-item" href="/promotion.html">🎁 Promo</a>
      <a class="nav-drawer-item" href="/referral.html">👥 Referral</a>
      <div style="margin-top:16px; border-top:1px solid #1e293b; padding-top:12px;">
        <a class="nav-drawer-item" href="/rules.html">📖 Cara Bermain</a>
        <a class="nav-drawer-item" href="/privacy.html">🔒 Privasi</a>
        <a class="nav-drawer-item" href="/terms.html">📄 Ketentuan</a>
      </div>
    </div>
  </nav>
"""

nav_js = """
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
"""

html = html.replace('<main class="app-main">', drawer + '\n  <main class="app-main">', 1)
html = html.replace('</body>', nav_js + '\n</body>', 1)

path.write_text(html, encoding="utf-8")
print("withdraw.html updated")
