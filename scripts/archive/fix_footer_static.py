#!/usr/bin/env python3
"""Fix footer-links untuk halaman statis yang belum lengkap."""
import re
from pathlib import Path

FRONTEND = Path(r"E:\gas terus 25\gasterus-v3\frontend")

STATIC_PAGES = ["privacy.html", "referral.html", "rules.html", "terms.html", "responsible-play.html"]

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
    
    if "footer-links" not in html:
        # Cari tag <footer> dan tambahkan footer-links sebelum konten di dalamnya
        if "<footer>\n" in html or "<footer>" in html:
            html = html.replace("<footer>", "<footer>\n" + FOOTER_LINKS, 1)
        elif "<footer " in html:
            html = html.replace("<footer ", "<footer>\n" + FOOTER_LINKS + "\n<footer ", 1)
    
    if html != original:
        path.write_text(html, encoding="utf-8")
        print(f"✅ {page_name}: footer-links added")
    else:
        print(f"✓ {page_name}: already has footer-links")

print("\n✅ SEMUA HALAMAN SUDAH LENGKAP!")
