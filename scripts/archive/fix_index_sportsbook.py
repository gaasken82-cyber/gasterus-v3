#!/usr/bin/env python3
"""Fix index.html dan sportsbook.html - tambah drawer, menu-toggle, footer-links, nav JS."""
import re
from pathlib import Path

BASE = Path(r"E:\gas terus 25\gasterus-v3\frontend")

DRAWER = (
    '\n  <!-- Navigation Drawer -->\n'
    '  <div class="nav-drawer-backdrop" id="navBackdrop"></div>\n'
    '  <nav class="nav-drawer" id="site-nav-drawer" aria-label="Main navigation">\n'
    '    <div class="nav-drawer-head">\n'
    '      <span class="nav-drawer-title">Menu</span>\n'
    '      <button type="button" class="nav-drawer-close" data-nav-close aria-label="Tutup Menu">✕</button>\n'
    '    </div>\n'
    '    <div class="nav-drawer-body">\n'
    '      <a class="nav-drawer-item" href="/index.html">Beranda</a>\n'
    '      <a class="nav-drawer-item" href="/member.html">Togel &amp; Slot</a>\n'
    '      <a class="nav-drawer-item" href="/sportsbook.html">Sportsbook</a>\n'
    '      <a class="nav-drawer-item" href="/number-history.html">Result</a>\n'
    '      <a class="nav-drawer-item" href="/bet-history.html">Riwayat Bet</a>\n'
    '      <a class="nav-drawer-item" href="/deposit.html">Deposit</a>\n'
    '      <a class="nav-drawer-item" href="/withdraw.html">Withdraw</a>\n'
    '      <a class="nav-drawer-item" href="/promotion.html">Promo</a>\n'
    '      <a class="nav-drawer-item" href="/referral.html">Referral</a>\n'
    '    </div>\n'
    '  </nav>\n'
)

NAV_JS = (
    '\n<script>\n'
    '(function(){\n'
    'function openNav(){var d=document.getElementById("site-nav-drawer"),b=document.getElementById("navBackdrop");'
    'if(d)d.classList.add("open");if(b)b.classList.add("show");document.body.classList.add("nav-open");}\n'
    'function closeNav(){var d=document.getElementById("site-nav-drawer"),b=document.getElementById("navBackdrop");'
    'if(d)d.classList.remove("open");if(b)b.classList.remove("show");document.body.classList.remove("nav-open");}\n'
    'document.querySelectorAll("[data-nav-open]").forEach(function(t){t.addEventListener("click",function(e){e.preventDefault();openNav();});});\n'
    'document.querySelectorAll("[data-nav-close]").forEach(function(e){e.addEventListener("click",closeNav);});\n'
    'document.getElementById("navBackdrop")?.addEventListener("click",closeNav);\n'
    'document.addEventListener("keydown",function(e){if(e.key==="Escape")closeNav();});\n'
    '})();\n'
    '</script>'
)

# 1. Fix index.html
print("Memperbaiki index.html...")
path = BASE / "index.html"
html = path.read_text(encoding="utf-8", errors="replace")

# Tambah menu-toggle di brand-bar
if "data-nav-open" not in html:
    old = '<header class="brand-bar">\n      <h1 class="brand-title">GASTERUS</h1>'
    new = (
        '<header class="brand-bar">\n'
        '      <button type="button" class="menu-toggle" data-nav-open aria-label="Menu">☰</button>\n'
        '      <h1 class="brand-title">GASTERUS</h1>'
    )
    html = html.replace(old, new, 1)

# Tambah drawer sebelum footer
if "nav-drawer" not in html:
    old = "<footer>"
    html = html.replace(old, DRAWER + "    <footer>", 1)

# Tambah nav JS
if "openNav" not in html:
    html = html.replace("</body>", NAV_JS + "\n</body>", 1)

path.write_text(html, encoding="utf-8")
print("  ✓ index.html: menu-toggle, drawer, nav JS ditambahkan")

# 2. Fix sportsbook.html - tambah footer-links
print("Memperbaiki sportsbook.html...")
path = BASE / "sportsbook.html"
html = path.read_text(encoding="utf-8", errors="replace")

if "footer-links" not in html:
    old = '<div class="container footer-bottom">'
    new = (
        '      <div class="footer-links">'
        '<a href="privacy.html">Privacy</a>'
        '<a href="rules.html">Cara Bermain</a>'
        '<a href="terms.html">Terms</a>'
        '</div>\n      <div class="container footer-bottom">'
    )
    html = html.replace(old, new, 1)

path.write_text(html, encoding="utf-8")
print("  ✓ sportsbook.html: footer-links ditambahkan")

print("\n✅ SEMUA PERBAIKAN SELESAI!")
