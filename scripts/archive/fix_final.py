#!/usr/bin/env python3
import re
from pathlib import Path

BASE = Path(r"E:\gas terus 25\gasterus-v3\frontend")

DRAWER = '''
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
      <div style="margin-top:16px; border-top:1px solid #1e293b; padding-top:12px;">
        <a class="nav-drawer-item" href="/rules.html">Cara Bermain</a>
        <a class="nav-drawer-item" href="/privacy.html">Privasi</a>
        <a class="nav-drawer-item" href="/terms.html">Ketentuan</a>
      </div>
    </div>
  </nav>
'''

NAV_JS = '''<script>
(function(){
function openNav(){var d=document.getElementById('site-nav-drawer'),b=document.getElementById('navBackdrop');if(d)d.classList.add('open');if(b)b.classList.add('show');document.body.classList.add('nav-open');}
function closeNav(){var d=document.getElementById('site-nav-drawer'),b=document.getElementById('navBackdrop');if(d)d.classList.remove('open');if(b)b.classList.remove('show');document.body.classList.remove('nav-open');}
document.querySelectorAll('[data-nav-open]').forEach(function(t){t.addEventListener('click',function(e){e.preventDefault();openNav();});});
document.querySelectorAll('[data-nav-close]').forEach(function(e){e.addEventListener('click',closeNav);});
document.getElementById('navBackdrop')?.addEventListener('click',closeNav);
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeNav();});
})();
</script>'''

def add_footer_links(html):
    if 'footer-links' not in html:
        return html.replace('<div class="container footer-bottom">', 
            '      <div class="footer-links"><a href="privacy.html">Privacy</a><a href="rules.html">Cara Bermain</a><a href="terms.html">Terms</a></div>\n      <div class="container footer-bottom">', 1)
    return html

def fix_withdraw():
    path = BASE / "withdraw.html"
    html = path.read_text(encoding="utf-8", errors="replace")
    html = add_footer_links(html)
    path.write_text(html, encoding="utf-8")
    print("✓ withdraw.html")

def fix_sportsbook():
    path = BASE / "sportsbook.html"
    html = path.read_text(encoding="utf-8", errors="replace")
    html = add_footer_links(html)
    path.write_text(html, encoding="utf-8")
    print("✓ sportsbook.html")

def fix_register():
    path = BASE / "register.html"
    html = path.read_text(encoding="utf-8", errors="replace")
    
    if 'data-nav-open' not in html:
        old = '<header class="brand-bar">\n      <h1 class="brand-title">GASTERUS</h1>'
        html = html.replace(old, '<header class="brand-bar">\n      <button type="button" class="menu-toggle" data-nav-open aria-label="Menu">☰</button>\n      <h1 class="brand-title">GASTERUS</h1>', 1)
    
    if 'nav-drawer' not in html:
        old = '<!-- Footer -->\n    <footer>'
        html = html.replace(old, DRAWER + '\n\n    <!-- Footer -->\n    <footer>', 1)
    
    html = add_footer_links(html)
    
    if 'openNav' not in html:
        html = html.replace('</body>', NAV_JS + '\n</body>', 1)
    
    path.write_text(html, encoding="utf-8")
    print("✓ register.html")

def fix_deposit():
    path = BASE / "deposit.html"
    html = path.read_text(encoding="utf-8", errors="replace")
    if 'nav-drawer' not in html:
        old = '<!-- Footer -->\n    <footer>'
        html = html.replace(old, DRAWER + '\n\n    <!-- Footer -->\n    <footer>', 1)
    path.write_text(html, encoding="utf-8")
    print("✓ deposit.html")

def fix_menu_toggle():
    for page in ["number-history.html", "promotion.html"]:
        path = BASE / page
        html = path.read_text(encoding="utf-8", errors="replace")
        if 'data-nav-open' not in html:
            old = '<a href="/index.html" class="brand-logo">\n        GASTERUS <span class="logo-badge">V3</span>'
            new = '<button type="button" class="menu-toggle" data-nav-open aria-label="Menu">☰</button>\n      <a href="/index.html" class="brand-logo">\n        GASTERUS <span class="logo-badge">V3</span>'
            html = html.replace(old, new, 1)
        path.write_text(html, encoding="utf-8")
        print(f"✓ {page}")

if __name__ == "__main__":
    fix_withdraw()
    fix_sportsbook()
    fix_register()
    fix_deposit()
    fix_menu_toggle()
    print("\n✅ SEMUA PERBAIKAN SELESAI!")
