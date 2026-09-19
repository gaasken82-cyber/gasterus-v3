#!/usr/bin/env python3
"""Add favicon, OG tags, nav drawer, footer links to static pages (privacy, referral, rules, terms, responsible-play)."""
import re
from pathlib import Path

FRONTEND = Path(r"E:\gas terus 25\gasterus-v3\frontend")

STATIC_PAGES = ["privacy.html", "referral.html", "rules.html", "terms.html", "responsible-play.html"]

FAVICON_LINK = '  <link rel="icon" type="image/svg+xml" href="favicon.svg">\n  <link rel="manifest" href="manifest.json">\n'

OG_TAGS = """
  <meta property="og:title" content="GASTERUS - Bandar Togel &amp; Slot Terpercaya">
  <meta property="og:description" content="Platform Mobile Resmi Bandar Togel dan Slot Online Terpercaya.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://gasterus.fun/">
  <meta property="og:image" content="https://gasterus.fun/favicon.svg">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="GASTERUS - Bandar Togel &amp; Slot Terpercaya">
  <meta name="twitter:description" content="Platform Mobile Resmi Bandar Togel dan Slot Online Terpercaya.">
  <meta name="twitter:image" content="https://gasterus.fun/favicon.svg">
  <meta name="theme-color" content="#2563eb">
"""

DRAWER = """
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
    </div>
  </nav>
"""

NAV_JS = """<script>
(function(){
function openNav(){var d=document.getElementById('site-nav-drawer'),b=document.getElementById('navBackdrop');if(d)d.classList.add('open');if(b)b.classList.add('show');document.body.classList.add('nav-open');}
function closeNav(){var d=document.getElementById('site-nav-drawer'),b=document.getElementById('navBackdrop');if(d)d.classList.remove('open');if(b)b.classList.remove('show');document.body.classList.remove('nav-open');}
document.querySelectorAll('[data-nav-open]').forEach(function(t){t.addEventListener('click',function(e){e.preventDefault();openNav();});});
document.querySelectorAll('[data-nav-close]').forEach(function(e){e.addEventListener('click',closeNav);});
document.getElementById('navBackdrop')?.addEventListener('click',closeNav);
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeNav();});
})();
</script>"""

FOOTER_LINKS = """
  <div class="footer-links">
    <a href="privacy.html">Privacy</a>
    <a href="rules.html">Cara Bermain</a>
    <a href="terms.html">Terms</a>
  </div>
"""

for page_name in STATIC_PAGES:
    path = FRONTEND / page_name
    html = path.read_text(encoding="utf-8", errors="replace")
    original = html
    
    # 1. Add favicon + manifest
    if "favicon.svg" not in html:
        html = html.replace("</head>", FAVICON_LINK + "</head>", 1)
    
    # 2. Add OG tags
    if "og:title" not in html:
        html = html.replace("</head>", OG_TAGS + "</head>", 1)
    
    # 3. Add menu-toggle
    if "data-nav-open" not in html:
        html = html.replace("<header", '  <button type="button" class="menu-toggle" data-nav-open aria-label="Menu">☰</button>\n  <header', 1)
    
    # 4. Add drawer
    if "nav-drawer" not in html:
        html = html.replace("<body>", "<body>\n" + DRAWER, 1)
    
    # 5. Add footer-links
    if "footer-links" not in html:
        html = html.replace("<footer>", "<footer>\n" + FOOTER_LINKS, 1)
    
    # 6. Add nav JS
    if "openNav" not in html:
        html = html.replace("</body>", NAV_JS + "\n</body>", 1)
    
    if html != original:
        path.write_text(html, encoding="utf-8")
        print(f"✅ {page_name}: updated")
    else:
        print(f"✓ {page_name}: already complete")

print("\n✅ SEMUA HALAMAN STATIS SUDAH DIPERBAIKI!")
