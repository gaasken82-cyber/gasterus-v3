#!/usr/bin/env python3
import re
from pathlib import Path

BASE = Path(r"E:\gas terus 25\gasterus-v3\frontend")

# Fix register.html
path = BASE / "register.html"
html = path.read_text(encoding="utf-8", errors="replace")
if "footer-links" not in html:
    old = '<footer>\n      <div>&copy; Copyright 2014 - 2026 GASTERUS. All Rights Reserved.</div>\n    </footer>'
    new = '<footer>\n      <div class="footer-links">\n        <a href="privacy.html">Privacy</a>\n        <a href="rules.html">Cara Bermain</a>\n        <a href="terms.html">Terms</a>\n      </div>\n      <div>&copy; Copyright 2014 - 2026 GASTERUS. All Rights Reserved.</div>\n    </footer>'
    html = html.replace(old, new, 1)
    path.write_text(html, encoding="utf-8")
    print("✓ register.html: footer-links added")

# Fix sportsbook.html
path = BASE / "sportsbook.html"
html = path.read_text(encoding="utf-8", errors="replace")
if "footer-links" not in html:
    old = '<div class="container footer-bottom">'
    new = '      <div class="footer-links">\n        <a href="privacy.html">Privacy</a>\n        <a href="rules.html">Cara Bermain</a>\n        <a href="terms.html">Terms</a>\n      </div>\n      <div class="container footer-bottom">'
    html = html.replace(old, new, 1)
    path.write_text(html, encoding="utf-8")
    print("✓ sportsbook.html: footer-links added")

print("\n✅ SEMUA PERBAIKAN SELESAI!")
