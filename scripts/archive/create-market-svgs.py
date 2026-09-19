#!/usr/bin/env python3
"""
Create SVG background images for each lottery market category.
Categories: asia, america, europe, default
"""

from pathlib import Path

OUTPUT_DIR = Path(r"E:\gas terus 25\gasterus-v3\frontend\assets\markets")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SVG_TEMPLATES = {}

SVG_TEMPLATES["asia.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="50%" stop-color="#16213e"/>
      <stop offset="100%" stop-color="#0f3460"/>
    </linearGradient>
    <linearGradient id="city" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#533483"/>
      <stop offset="100%" stop-color="#e94560"/>
    </linearGradient>
  </defs>
  <rect width="400" height="200" fill="url(#sky)"/>
  <g fill="url(#city)" opacity="0.8">
    <rect x="10" y="120" width="30" height="60" rx="2"/>
    <rect x="50" y="100" width="25" height="80" rx="2"/>
    <rect x="85" y="130" width="35" height="50" rx="2"/>
    <rect x="130" y="90" width="28" height="90" rx="2"/>
    <rect x="170" y="110" width="32" height="70" rx="2"/>
    <rect x="215" y="95" width="26" height="85" rx="2"/>
    <rect x="250" y="120" width="30" height="60" rx="2"/>
    <rect x="290" y="105" width="28" height="75" rx="2"/>
    <rect x="330" y="125" width="35" height="55" rx="2"/>
  </g>
  <circle cx="340" cy="40" r="18" fill="#f5f5f5" opacity="0.9"/>
  <circle cx="345" cy="35" r="15" fill="#1a1a2e"/>
  <text x="200" y="175" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#ffffff" opacity="0.7">ASIA</text>
</svg>"""

SVG_TEMPLATES["america.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f0c29"/>
      <stop offset="50%" stop-color="#302b63"/>
      <stop offset="100%" stop-color="#24243e"/>
    </linearGradient>
  </defs>
  <rect width="400" height="200" fill="url(#sky)"/>
  <g fill="#ffffff">
    <circle cx="30" cy="20" r="1.5" opacity="0.8"/>
    <circle cx="80" cy="35" r="1" opacity="0.6"/>
    <circle cx="130" cy="15" r="1.5" opacity="0.9"/>
    <circle cx="200" cy="25" r="1" opacity="0.7"/>
    <circle cx="270" cy="10" r="1.5" opacity="0.8"/>
    <circle cx="350" cy="30" r="1" opacity="0.6"/>
    <circle cx="50" cy="50" r="1" opacity="0.5"/>
    <circle cx="150" cy="45" r="1.5" opacity="0.7"/>
    <circle cx="250" cy="40" r="1" opacity="0.6"/>
    <circle cx="320" cy="55" r="1.5" opacity="0.8"/>
  </g>
  <g fill="#1a1a2e">
    <path d="M130 80 L130 40 L125 40 L125 25 L135 25 L135 40 L130 40 M130 40 L135 30 L140 25 L145 30 L140 40 L140 80 L130 80 Z"/>
    <rect x="125" y="80" width="10" height="40"/>
    <rect x="50" y="100" width="40" height="60"/>
    <rect x="180" y="90" width="50" height="70"/>
    <rect x="240" y="110" width="35" height="50"/>
  </g>
  <text x="200" y="175" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#ffffff" opacity="0.7">AMERICA</text>
</svg>"""

SVG_TEMPLATES["europe.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2c3e50"/>
      <stop offset="50%" stop-color="#3498db"/>
      <stop offset="100%" stop-color="#2980b9"/>
    </linearGradient>
  </defs>
  <rect width="400" height="200" fill="url(#sky)"/>
  <g fill="#000000" opacity="0.85">
    <path d="M180 180 L175 140 L170 100 L165 60 L160 40 L155 20 L175 20 L195 20 L190 40 L185 60 L180 100 L175 140 L170 180 Z"/>
    <rect x="165" y="180" width="30" height="20"/>
  </g>
  <g fill="#000000" opacity="0.6">
    <rect x="30" y="100" width="40" height="80" rx="2"/>
    <rect x="80" y="80" width="35" height="100" rx="2"/>
    <rect x="120" y="90" width="30" height="90" rx="2"/>
    <rect x="250" y="95" width="45" height="85" rx="2"/>
    <rect x="305" y="110" width="30" height="70" rx="2"/>
  </g>
  <text x="200" y="175" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#ffffff" opacity="0.7">EUROPE</text>
</svg>"""

SVG_TEMPLATES["default.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a0e27"/>
      <stop offset="50%" stop-color="#1a1a3e"/>
      <stop offset="100%" stop-color="#0d1b2a"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="400" height="200" fill="url(#bg)"/>
  <rect width="400" height="200" fill="url(#glow)"/>
  <g stroke="#3b82f6" stroke-width="0.5" opacity="0.3">
    <line x1="0" y1="50" x2="400" y2="50"/>
    <line x1="0" y1="100" x2="400" y2="100"/>
    <line x1="0" y1="150" x2="400" y2="150"/>
  </g>
  <g fill="#ffffff" opacity="0.4">
    <circle cx="50" cy="30" r="1"/>
    <circle cx="100" cy="60" r="1"/>
    <circle cx="150" cy="25" r="1"/>
    <circle cx="200" cy="55" r="1"/>
    <circle cx="250" cy="35" r="1"/>
    <circle cx="300" cy="65" r="1"/>
    <circle cx="350" cy="30" r="1"/>
  </g>
  <text x="200" y="175" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#ffffff" opacity="0.5">PASARAN</text>
</svg>"""

# ===== SPECIFIC MARKET BACKGROUNDS =====
SVG_TEMPLATES["sg.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a2a6c"/>
      <stop offset="50%" stop-color="#b71c1c"/>
      <stop offset="100%" stop-color="#1a2a6c"/>
    </linearGradient>
  </defs>
  <rect width="400" height="200" fill="url(#bg)"/>
  <g fill="#fff" opacity="0.7">
    <rect x="20" y="40" width="60" height="100" rx="30"/>
    <rect x="90" y="60" width="60" height="80" rx="30"/>
  </g>
  <text x="200" y="175" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#ffffff">SINGAPORE</text>
</svg>"""

SVG_TEMPLATES["hk.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#be123c"/>
      <stop offset="50%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#be123c"/>
    </linearGradient>
  </defs>
  <rect width="400" height="200" fill="url(#bg)"/>
  <g fill="#fff" opacity="0.6">
    <circle cx="100" cy="100" r="30"/>
    <circle cx="100" cy="100" r="18" fill="#be123c"/>
  </g>
  <text x="200" y="175" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#ffffff">HONGKONG</text>
</svg>"""

SVG_TEMPLATES["syd.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#059669"/>
      <stop offset="50%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
  </defs>
  <rect width="400" height="200" fill="url(#bg)"/>
  <g fill="#fff" opacity="0.7">
    <path d="M200 40 L220 100 L200 160 L180 100 Q200 160 200 160 Z"/>
    <rect x="90" y="130" width="60" height="20" rx="10"/>
  </g>
  <text x="200" y="175" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#ffffff">SYDNEY</text>
</svg>"""

SVG_TEMPLATES["ny.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2563eb"/>
      <stop offset="50%" stop-color="#1e40af"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>
  <rect width="400" height="200" fill="url(#bg)"/>
  <g fill="#fff" opacity="0.7">
    <rect x="80" y="50" width="240" height="4" transform="rotate(-20 200 52)"/>
    <rect x="80" y="98" width="240" height="4" transform="rotate(0 200 100)"/>
    <rect x="80" y="146" width="240" height="4" transform="rotate(20 200 148)"/>
  </g>
  <text x="200" y="175" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#ffffff">NEW YORK</text>
</svg>"""

SVG_TEMPLATES["macau.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="50%" stop-color="#ec4899"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="40%">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#fbbf24" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="400" height="200" fill="url(#bg)"/>
  <rect width="400" height="200" fill="url(#glow)"/>
  <g fill="#fff" opacity="0.6">
    <path d="M200 100 L230 50 L260 100 L230 150 Z"/>
    <path d="M200 100 L170 50 L140 100 L170 150 Z"/>
  </g>
  <text x="200" y="175" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#ffffff">MACAU</text>
</svg>"""

SVG_TEMPLATES["wellington.svg"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0ea5e9"/>
      <stop offset="50%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#0ea5e9"/>
    </linearGradient>
  </defs>
  <rect width="400" height="200" fill="url(#bg)"/>
  <g fill="#1e293b" opacity="0.8">
    <path d="M100 100 Q200 60 300 100 Q200 160 100 100 Z"/>
  </g>
  <text x="200" y="175" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#1e293b">WELLINGTON</text>
</svg>"""

for filename, svg_content in SVG_TEMPLATES.items():
    filepath = OUTPUT_DIR / filename
    filepath.write_text(svg_content, encoding="utf-8")
    print(f"Created: {filename} ({len(svg_content)} bytes)")

print(f"\n✅ All SVG backgrounds created in: {OUTPUT_DIR}")
