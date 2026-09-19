#!/usr/bin/env python3
import re
from pathlib import Path

path = Path(r"E:\gas terus 25\gasterus-v3\frontend\withdraw.html")
html = path.read_text(encoding="utf-8")

# Remove ALL drawer blocks
html = re.sub(r'\s*<!-- Navigation Drawer -->.*?</nav>', '', html, flags=re.DOTALL)

# Remove the duplicate nav JS (keep only one)
html = re.sub(r'\s*<script>\s*\(function \(\) \{\s*function openNav\(\)', '\n<script>\n    (function () {\n      function openNav()', html, flags=re.DOTALL)

# Insert drawer before <main>
drawer = '''
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
  </nav>'''

html = html.replace('<main class="app-main">', drawer + '\n  <main class="app-main">', 1)

path.write_text(html, encoding="utf-8")
print("OK - withdraw.html fixed")
