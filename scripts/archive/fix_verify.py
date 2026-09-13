#!/usr/bin/env python3
"""Fix sportsbook.html and verify all pages have consistent nav and footer."""
import re
from pathlib import Path

BASE = Path(r"E:\gas terus 25\gasterus-v3\frontend")

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

# Fix sportsbook.html
path = BASE / "sportsbook.html"
html = path.read_text(encoding="utf-8", errors="replace")

# Remove existing sb-nav dari header dan ganti dengan yang konsisten
html = re.sub(r'<nav class="sb-nav".*?</nav>', '', html, flags=re.DOTALL)

# Tambah menu-toggle di header
old_h = '<a href="/index.html" class="sb-brand">GASTERUS<span class="sb-brand-badge">SPORTSBOOK</span></a>'
new_h = '<button type="button" class="menu-toggle" data-nav-open aria-label="Menu">☰</button>\n      <a href="/index.html" class="sb-brand">GASTERUS<span class="sb-brand-badge">SPORTSBOOK</span></a>'
html = html.replace(old_h, new_h, 1)

# Tambah drawer sebelum <main>
html = html.replace('<main class="sb-main">', DRAWER_HTML + '\n  <main class="sb-main">', 1)

# Tambah footer links
old_footer = '<div class="container footer-bottom">'
new_footer = '''      <div class="footer-links">
        <a href="privacy.html">Privacy</a>
        <a href="responsible-play.html">Responsible Gaming</a>
        <a href="terms.html">Terms</a>
      </div>
      <div class="container footer-bottom">'''
html = html.replace(old_footer, new_footer, 1)

# Tambah nav JS sebelum </body>
html = html.replace('</body>', NAV_JS + '\n</body>', 1)

path.write_text(html, encoding="utf-8")
print("OK - sportsbook.html fixed")

# Verify all pages
print("\n=== VERIFIKASI SEMUA HALAMAN ===")
pages = [
    "index.html",
    "member.html", 
    "register.html",
    "deposit.html",
    "withdraw.html",
    "bet-history.html",
    "market-play.html",
    "number-history.html",
    "promotion.html",
    "sportsbook.html",
]

for page_name in pages:
    path = BASE / page_name
    html = path.read_text(encoding="utf-8", errors="replace")
    has_drawer = "nav-drawer" in html
    has_menu_toggle = "menu-toggle" in html and "data-nav-open" in html
    has_footer_links = "footer-links" in html
    status = "✅" if (has_drawer and has_menu_toggle and has_footer_links) else "⚠️"
    print(f"{status} {page_name}: drawer={has_drawer}, menuToggle={has_menu_toggle}, footerLinks={has_footer_links}")
