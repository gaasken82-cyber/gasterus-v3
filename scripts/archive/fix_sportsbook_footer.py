#!/usr/bin/env python3
"""Fix sportsbook.html - tambah footer-links."""
from pathlib import Path

BASE = Path(r"E:\gas terus 25\gasterus-v3\frontend")
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
    print("✓ sportsbook.html: footer-links ditambahkan")
else:
    print("✓ sportsbook.html: sudah ada footer-links")

# Verifikasi
html = path.read_text(encoding="utf-8", errors="replace")
print(f"  footer-links: {'footer-links' in html}")
print(f"  drawer: {'nav-drawer' in html}")
print(f"  menu-toggle: {'menu-toggle' in html and 'data-nav-open' in html}")
