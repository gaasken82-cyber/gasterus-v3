#!/usr/bin/env python3
"""Add Service Worker registration to all HTML pages."""
from pathlib import Path

FRONTEND = Path(r"E:\gas terus 25\gasterus-v3\frontend")

SW_SCRIPT = """<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(r => console.log('SW registered')).catch(e => console.log('SW fail'));
    });
  }
</script>"""

for html_file in sorted(FRONTEND.glob("*.html")):
    content = html_file.read_text(encoding="utf-8", errors="replace")
    
    if "serviceWorker" not in content or "sw.js" not in content:
        # Insert before </head>
        content = content.replace("</head>", SW_SCRIPT + "\n</head>", 1)
        html_file.write_text(content, encoding="utf-8")
        print(f"✅ {html_file.name}: SW added")
    else:
        print(f"✓ {html_file.name}: already has SW")

print("\n✅ SEMUA HALAMAN SUDAH ADA SERVICE WORKER!")
