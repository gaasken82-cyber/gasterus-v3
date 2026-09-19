#!/usr/bin/env python3
"""Add favicon link and Open Graph meta tags to all HTML pages."""
from pathlib import Path

FRONTEND = Path(r"E:\gas terus 25\gasterus-v3\frontend")

# Common meta tags to add to <head>
FAVICON_LINK = '  <link rel="icon" type="image/svg+xml" href="favicon.svg">\n  <link rel="manifest" href="manifest.json">\n'

OG_TAGS = """  <meta property="og:title" content="GASTERUS - Bandar Togel & Slot Terpercaya">
  <meta property="og:description" content="Platform Mobile Resmi Bandar Togel dan Slot Online Terpercaya.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://gasterus.fun/">
  <meta property="og:image" content="https://gasterus.fun/favicon.svg">
  <meta property="og:image:width" content="64">
  <meta property="og:image:height" content="64">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="GASTERUS - Bandar Togel & Slot Terpercaya">
  <meta name="twitter:description" content="Platform Mobile Resmi Bandar Togel dan Slot Online Terpercaya.">
  <meta name="twitter:image" content="https://gasterus.fun/favicon.svg">
  <meta name="theme-color" content="#2563eb">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
"""

# Pages to update
PAGES = [
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

for page_name in PAGES:
    path = FRONTEND / page_name
    html = path.read_text(encoding="utf-8", errors="replace")
    
    # Add favicon link + manifest if not present
    if 'href="favicon.svg"' not in html:
        # Insert after Google Fonts link (before closing </head>)
        html = html.replace('<link href="https://fonts.googleapis.com/css2?',
                           '<link href="https://fonts.googleapis.com/css2?', 1)
        
        # Find <link href="https://fonts... and insert after it
        if '<link href="https://fonts.gstatic.com' in html:
            html = html.replace(
                '<link href="https://fonts.gstatic.com crossorigin>',
                '<link href="https://fonts.gstatic.com crossorigin>\n'
                + FAVICON_LINK,
                1
            )
        elif '<link href="https://fonts.googleapis.com/css' in html:
            html = html.replace(
                '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800;900&display=swap" rel="stylesheet">',
                '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800;900&display=swap" rel="stylesheet">\n'
                + FAVICON_LINK,
                1
            )
    
    # Add OG tags if not present
    if 'og:title' not in html:
        # Insert before </head>
        html = html.replace('</head>', OG_TAGS + '</head>', 1)
    
    path.write_text(html, encoding="utf-8")
    print(f"✅ {page_name}: favicon + OG tags added")

print("\n✅ SEMUA HALAMAN SUDAH ADA FAVICON & OG TAGS!")
