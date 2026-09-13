#!/usr/bin/env python3
"""Create SEO & PWA files: favicon.svg, manifest.json, robots.txt, sitemap.xml."""
import json
from pathlib import Path

FRONTEND = Path(r"E:\gas terus 25\gasterus-v3\frontend")

# 1. Favicon SVG
favicon_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#60a5fa"/>
      <stop offset="100%" style="stop-color:#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="12" fill="url(#g)"/>
  <text x="32" y="44" font-family="Arial Black, Arial, sans-serif" font-size="36" font-weight="900" fill="#fff" text-anchor="middle">G</text>
</svg>"""

(FRONTEND / "favicon.svg").write_text(favicon_svg, encoding="utf-8")
print("✅ favicon.svg created")

# 2. Manifest JSON
manifest = {
    "name": "Gasterus V3 - Togel & Slot",
    "short_name": "Gasterus",
    "description": "Platform Mobile Resmi Bandar Togel dan Slot Online Terpercaya",
    "start_url": "/index.html",
    "display": "standalone",
    "background_color": "#050b14",
    "theme_color": "#2563eb",
    "icons": [
        {"src": "/favicon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any"},
        {"src": "/favicon.svg", "sizes": "192x192", "type": "image/svg+xml", "purpose": "maskable"},
        {"src": "/favicon.svg", "sizes": "512x512", "type": "image/svg+xml", "purpose": "maskable"}
    ]
}

(FRONTEND / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print("✅ manifest.json created")

# 3. Robots.txt
robots_txt = """User-agent: *
Allow: /

Sitemap: https://gasterus.fun/sitemap.xml
"""

(FRONTEND / "robots.txt").write_text(robots_txt, encoding="utf-8")
print("✅ robots.txt created")

# 4. Sitemap XML
sitemap_xml = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://gasterus.fun/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://gasterus.fun/member.html</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://gasterus.fun/register.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://gasterus.fun/deposit.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://gasterus.fun/withdraw.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://gasterus.fun/bet-history.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://gasterus.fun/sportsbook.html</loc>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://gasterus.fun/market-play.html</loc>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://gasterus.fun/number-history.html</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://gasterus.fun/promotion.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://gasterus.fun/referral.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://gasterus.fun/rules.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://gasterus.fun/privacy.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://gasterus.fun/terms.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://gasterus.fun/responsible-play.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>
"""

(FRONTEND / "sitemap.xml").write_text(sitemap_xml, encoding="utf-8")
print("✅ sitemap.xml created")

print("\n✅ SEMUA FILE SEO & PWA SELESAI!")
