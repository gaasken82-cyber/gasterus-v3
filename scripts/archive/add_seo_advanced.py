#!/usr/bin/env python3
"""Add canonical URL and JSON-LD structured data to all HTML pages."""
import json
from pathlib import Path

FRONTEND = Path(r"E:\gas terus 25\gasterus-v3\frontend")

CANONICAL = '  <link rel="canonical" href="https://gasterus.fun/">\n'

# JSON-LD for Organization
JSON_LD = """
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "GASTERUS",
    "url": "https://gasterus.fun",
    "description": "Platform Mobile Resmi Bandar Togel dan Slot Online Terpercaya",
    "logo": "https://gasterus.fun/favicon.svg",
    "sameAs": [
      "https://gasterus.fun"
    ]
  }
  </script>
"""

def get_page_url(filename):
    """Get canonical URL for a page."""
    if filename == "index.html":
        return "https://gasterus.fun/"
    return f"https://gasterus.fun/{filename}"

for html_file in sorted(FRONTEND.glob("*.html")):
    content = html_file.read_text(encoding="utf-8", errors="replace")
    original = content
    
    page_url = get_page_url(html_file.name)
    
    # Add canonical URL (with correct page URL)
    canonical_tag = f'  <link rel="canonical" href="{page_url}">\n'
    if 'rel="canonical"' not in content:
        # Insert after favicon link or after Google Fonts
        if 'href="favicon.svg"' in content:
            content = content.replace('href="favicon.svg"', 'href="favicon.svg"' + canonical_tag, 1)
        else:
            content = content.replace('</head>', canonical_tag + '</head>', 1)
    
    # Add JSON-LD
    if 'application/ld+json' not in content:
        content = content.replace('</head>', JSON_LD + '</head>', 1)
    
    if content != original:
        html_file.write_text(content, encoding="utf-8")
        print(f"✅ {html_file.name}: canonical + JSON-LD added")
    else:
        print(f"✓ {html_file.name}: already has canonical + JSON-LD")

print("\n✅ SEMUA HALAMAN SUDAH ADA CANONICAL & JSON-LD!")
