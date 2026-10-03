# 🗺️ MAINTENANCE GUIDE — gasterus-v3

> **Baca dokumen ini PERTAMA sebelum menyentuh CSS atau HTML apapun.**
> Tujuan: Mencegah duplikasi, konflik, dan patch berulang yang membuang token.

---

## 📐 WORKFLOW WAJIB (2-Agent System)

`
CLAUDE (Analyst)                    CLINE (Executor)
──────────────────                  ────────────────
1. Baca MAINTENANCE.md         →    Tunggu instruksi
2. Lihat screenshot target     →
3. Audit: cari selector exist  →
4. Buat laporan per-element    →    Terima laporan
5. Tentukan: MODIFY / REMOVE   →    FIND → MODIFY → VERIFY
`

**Format laporan Claude ke Cline:**
`
ELEMENT          : [nama elemen]
CSS FILE         : [nama file CSS]
EXISTING SELECTOR: [selector exact, + line number jika bisa]
CURRENT STYLE    : [property yang ada sekarang]
TARGET STYLE     : [property yang harus ada]
CSS TO CHANGE    : [property: value baru]
CSS TO REMOVE    : [property yang dihapus]
CSS TO PRESERVE  : [property yang TIDAK boleh disentuh]
CSS FILE STATUS  : LOADED / NOT LINKED (+ posisi link jika NOT LINKED)
ASSET STATUS     : NOT NEEDED / EXISTS (path) / NEEDS PLACEHOLDER
`

### ❌ DILARANG KERAS
| Larangan | Alasan |
|----------|--------|
| Append CSS class baru tanpa grep dulu | Menyebabkan duplikat |
| Append section HTML tanpa baca file dulu | Nav-drawer/footer muncul 2x |
| Membuat fix_xxx2.py, fix_xxx3.py | Sudah ada 21 script fix menumpuk |
| Overwrite seluruh file tanpa diff | Kehilangan patch sebelumnya |
| Menambah !important | Menyembunyikan konflik, sulit di-debug |

---

## 🗂️ PETA CSS — File & Tanggung Jawab

### Dua Strategy CSS yang Dipakai (JANGAN dicampur per halaman!)

#### Strategy A — "Mobile Blue Stack" (all-in-one)
File tunggal: css/mobile-blue.css
Halaman yang pakai: index, member, deposit, register, 404

#### Strategy B — "Modular Stack"
File terpisah berurutan:
1. /css/tokens.css       <- CSS variables (--bg-app, --brand-primary, dll)
2. /css/base.css         <- Reset, typography dasar
3. /css/layout.css       <- Header, footer, nav-drawer, grid
4. /css/components.css   <- .btn, .badge, .table, dll
5. /css/animations.css   <- Keyframes, transitions
6. /css/mobile.css       <- Responsive overrides
7. /css/pages/[page].css <- Hanya style spesifik halaman itu
Halaman yang pakai: withdraw, bet-history, market-play, promotion, referral, rules, terms, privacy, responsible-play, number-history

---

## 📋 STATUS CSS PER HALAMAN

| Halaman | Strategy | tokens.css | Status |
|---------|----------|-----------|--------|
| index.html | A (mobile-blue) | Built-in | OK |
| member.html | A (mobile-blue) | Built-in | OK |
| deposit.html | A (mobile-blue) | Built-in | OK |
| register.html | A (mobile-blue) | Built-in | OK |
| 404.html | A (mobile-blue) | Built-in | OK |
| withdraw.html | B (modular) | TIDAK DI-LINK | Perlu ditambah |
| bet-history.html | B (modular) | TIDAK DI-LINK | Perlu ditambah |
| market-play.html | B (modular) | TIDAK DI-LINK | Perlu ditambah |
| promotion.html | B (modular) | TIDAK DI-LINK | Perlu ditambah |
| number-history.html | B (modular) | TIDAK DI-LINK | Perlu ditambah |
| referral.html | B (modular) | Di-link | OK |
| rules.html | B (modular) | Di-link | OK |
| terms.html | B (modular) | Di-link | OK |
| privacy.html | B (modular) | Di-link | OK |
| responsible-play.html | B (modular) | Di-link | OK |
| sportsbook.html | C (hanya sportsbook.css) | TIDAK ADA | KRITIS — tampilan rusak |

---

## ⚠️ KONFLIK CSS YANG DIKETAHUI

### Duplikat DALAM satu file (belum dibersihkan)

mobile-blue.css — 19 class duplikat:
| Class | Jumlah | Prioritas |
|-------|--------|-----------|
| .qris-white-card | 8x | DARURAT |
| .deposit-row | 6x | DARURAT |
| .res-search | 4x | Tinggi |
| .deposit-note-box, .site-footer, .footer-social, .inp-wrap, .cs-info, .reg-phone-wrap, .reg-checkbox, .table | 3x | Tinggi |
| 11 class lain | 2x | Sedang |

sportsbook.css — 8 class duplikat:
| Class | Jumlah |
|-------|--------|
| .sb-nav | 4x |
| .sb-slip-stake | 3x |
| .sb-search, .sb-stale-banner, .sb-error, .sb-slip-pick, .sb-slip-row, .sb-quote-ok | 2x masing-masing |

layout.css — 4 class duplikat:
| Class | Jumlah |
|-------|--------|
| .footer-col | 4x |
| .app-header, .brand-logo, .balance-pill | 2x masing-masing |

### Konflik ANTAR file (class di 2+ file)

| Class | Ada di | Authority |
|-------|--------|-----------|
| .menu-toggle, .nav-drawer, .nav-drawer-* | mobile-blue.css vs layout.css | layout.css |
| .btn, .btn-primary, .btn-secondary, .btn-sm, .btn-block | mobile-blue.css vs components.css | components.css |
| .badge, .badge-* | mobile-blue.css vs components.css | components.css |
| .table, .table-responsive | mobile-blue.css vs components.css | components.css |
| .bank-card | mobile-blue.css vs home.css | Perlu investigasi |
| .member-market-card, .member-market-grid | mobile-blue.css vs member.css | member.css |

---

## 🔍 QUICK AUDIT COMMANDS

# Cari apakah class sudah ada SEBELUM menambah:
Select-String -Path frontend/css/mobile-blue.css -Pattern "\.nama-class" | Select LineNumber, Line

# Cek class muncul di CSS mana saja:
Select-String -Path frontend/css/*.css,frontend/css/pages/*.css -Pattern "^\.nama-class[\s{]"

# Cek duplikat dalam satu file:
Select-String -Path frontend/css/mobile-blue.css -Pattern "^\.[a-z]" | Group-Object { (.Line -split "\s")[0] } | Where-Object Count -gt 1 | Sort-Object Count -Descending

# Lihat perubahan vs git HEAD:
git diff --stat HEAD

---

## 🛠️ ISSUE TRACKER

### BELUM DIKERJAKAN — Darurat (lakukan segera)
- [x] Fix sportsbook.html: Tambah tokens.css sebelum sportsbook.css
- [x] Bersihkan duplikat mobile-blue.css: .qris-white-card, .deposit-tab-item, .preset-pill-btn, .btn-qris-submit (Consolidated cleanly)

### BELUM DIKERJAKAN — Tinggi
- [ ] Bersihkan semua duplikat sportsbook.css (8 class)
- [ ] Bersihkan duplikat layout.css (4 class)
- [ ] Resolve konflik nav-drawer: layout.css sebagai authority, hapus dari mobile-blue.css

### BELUM DIKERJAKAN — Sedang
- [ ] Tambah tokens.css ke: withdraw, bet-history, market-play, promotion, number-history
- [ ] Resolve konflik .btn, .badge, .table: components.css sebagai authority
- [ ] Hapus file null di root project
- [ ] Arsipkan scripts/fix_*.py ke scripts/archive/

### SUDAH DIKERJAKAN
- [x] Audit awal — identifikasi semua masalah (09 Sep 2026)
- [x] Buat MAINTENANCE.md ini (09 Sep 2026)

---

## 📁 STRUKTUR FILE CSS

frontend/css/
|-- tokens.css          <- CSS Variables global (--brand-*, --bg-*, --text-*)
|-- base.css            <- Reset, body, typography dasar
|-- layout.css          <- app-header, nav-drawer, site-footer, grid
|-- components.css      <- btn, badge, table, card, form elements
|-- animations.css      <- @keyframes, transition utilities
|-- mobile.css          <- Responsive breakpoints
|-- mobile-blue.css     <- ALL-IN-ONE untuk halaman Strategy A
|-- home.css            <- Hanya untuk index.html (jika terpisah)
|-- member.css          <- Hanya untuk member.html (jika terpisah)
|-- pages/
    |-- sportsbook.css  <- Hanya untuk sportsbook.html
    |-- transaction.css <- Hanya untuk withdraw.html
    |-- market-play.css <- Hanya untuk market-play.html

---

## 📝 LOG PERUBAHAN

| Tanggal | File | Perubahan | Oleh |
|---------|------|-----------|------|
| 09 Sep 2026 | Semua 21 file | +3113/-525 baris belum di-commit | Cline |
| 09 Sep 2026 | MAINTENANCE.md | Dibuat pertama kali | Claude/Antigravity |

---
Update dokumen ini setiap kali ada perubahan signifikan pada CSS/HTML structure.
