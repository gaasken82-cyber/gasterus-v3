# UI ANALYSIS REPORT — Gasterus v3 (Blue Safir & Silver Edition)
> **Role**: UI Analyst + CSS Architect  
> **Source of Truth**: Project Existing (`frontend/`)  
> **Target Visual Theme**: **BLUE SAFIR & METALLIC SILVER (Luxury Sapphire & Chrome Edition)**  
> **Layout Reference**: Cindototo Mobile Structure (Presisi 1:1, Layout, Sizing, Spacing, dan Komponen)  
> **Date**: 08 September 2026

---

## 💎 EXECUTIVE SUMMARY: TRANSFORMASI TEMA BLUE SAFIR & SILVER

Sesuai arahan baru, tema visual dirombak dari **Merah & Emas** menjadi **Blue Safir (Royal Sapphire Blue) & Metallic Silver (Chrome/Platinum)**.

### Karakteristik Visual Blue Safir & Silver:
1. **Midnight Sapphire Atmosphere**: Background tidak lagi hitam-merah atau biru flat, melainkan **Midnight Sapphire Velvet** (`#050b14` ke `#0a1322`) dengan pendaran cahaya safir royal (`rgba(37, 99, 235, 0.35)`).
2. **Polished Silver / Platinum Accents**: Elemen yang sebelumnya kuning emas (seperti Tombol Log in, Tombol Keluhan, Tombol Jadwal, Header Pasaran) bertransformasi menjadi **Platinum / Polished Silver 3D High-Gloss** (`#ffffff` → `#cbd5e1` → `#94a3b8`) dengan teks kontras gelap pekat.
3. **Royal Sapphire CTA Elements**: Tombol pendaftaran dan download bertransformasi menjadi **Vibrant Sapphire Blue 3D** (`#3b82f6` → `#1d4ed8` → `#1e3a8a`) dengan pantulan kilau bevel perak di sisi atas.
4. **Presisi Struktur Layout Tetap 100%**:
   - Grid Bank Status tetap **2 Kolom Kapsul Hitam** + lampu oval hijau.
   - Kartu CS tetap **Kapsul Metalik Silver/Slate 3D** + bevel perak di bawah + "KLIK DISINI" putih tebal.
   - Hasil Pasaran tetap **4 Kolom** dengan Header Kapsul Silver & angka keluaran Ice Sapphire Blue (`#38bdf8`).
   - Form Login tetap **Kapsul Putih Bersih** dengan Badge Ikon Silver/Sapphire.
   - Footer tetap bersih (hanya 1 baris copyright, `.footer-links` disembunyikan).

---

## 🎨 PALET WARNA MASTER: BLUE SAFIR & METALLIC SILVER

| Kategori Desain | Nilai Hex / Gradient | Penggunaan Komponen |
|---|---|---|
| **App Background** | `#050b14` (Midnight Black-Sapphire) | `body` background |
| **Site Container** | `linear-gradient(180deg, #050b14 0%, #0a1526 40%, #050b14 100%)` | `.site` background wrapper |
| **Sapphire Primary** | `#2563eb` (Blue 600) / `#1d4ed8` (Blue 700) | Tombol Daftar, Tombol Download, Active Rings |
| **Sapphire Dark Surface**| `linear-gradient(180deg, #0f203c 0%, #071120 100%)` | App Banner, Hero Frame, Result Card Body |
| **Ice Sapphire Glow** | `#38bdf8` (Cyan/Sky 400) / `#60a5fa` | Angka Pasaran Togel, Focus Glow, Domain Text |
| **Polished Silver 3D** | `linear-gradient(180deg, #ffffff 0%, #e2e8f0 55%, #cbd5e1 100%)` | Tombol Log in, Keluhan, Jadwal, Header Pasaran |
| **Silver Chrome Border** | `1px solid rgba(226, 232, 240, 0.45)` / `#cbd5e1` | Border Kapsul Domain, Kartu CS, Result Box |
| **Dark Slate Metallic** | `linear-gradient(180deg, #1e293b 0%, #0f172a 100%)` | Kartu CS 2x2, Bank Container |

---

## CSS LOAD STATUS AUDIT

Berdasarkan `index.html` line 14:
```html
<link rel="stylesheet" href="/css/mobile-blue.css">
```
| File CSS | Status | Catatan |
|---|---|---|
| `css/mobile-blue.css` | ✅ **LOADED** | **SATU-SATUNYA file aktif**. Semua perubahan dieksekusi di sini! |
| `css/tokens.css`, `base.css`, `layout.css`, dll | ❌ **NOT LINKED** | Jangan diedit karena tidak diload di `index.html` |

---

## 📋 SPESIFIKASI ELEMEN PER ELEMEN (BLUE SAFIR & SILVER EDITION)

---

### ELEMENT 1 — Top Android App Download Banner
- **COMPONENT**: App Banner bar
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.app-banner` (line 46–55)
- **TARGET STYLE**: Deep Sapphire gradient dengan border bawah Royal Sapphire
- **CSS TO CHANGE**:
```css
background: linear-gradient(180deg, #0f203c 0%, #071120 100%);
border-bottom: 2px solid #2563eb;
```
- **PRESERVE**: `padding: 6px 10px`, `display: flex`, `align-items: center`, `gap: 8px`

---

### ELEMENT 2 — App Icon Box di Banner
- **COMPONENT**: App icon container
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.app-icon-box` (line 67–79)
- **TARGET STYLE**: Kotak hitam pekat dengan border Polished Silver / Ice Sapphire
- **CSS TO CHANGE**:
```css
background: #000000;
border: 1px solid #cbd5e1;
box-shadow: 0 0 8px rgba(56, 189, 248, 0.3);
```

---

### ELEMENT 3 — App Banner Title & Subtitle
- **COMPONENT**: App title & subtitle
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.app-title` (line 86–92) & `.app-sub` (line 94–98)
- **TARGET STYLE**: Title Putih Silver cerah, subtitle Ice Sapphire
- **CSS TO CHANGE**:
```css
.app-title {
  color: #ffffff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.3px;
  text-shadow: 0 1px 2px #000;
}
.app-sub {
  color: #93c5fd;
  font-size: 9.5px;
}
```

---

### ELEMENT 4 — Download Button (App Banner)
- **COMPONENT**: Download CTA capsule
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.app-btn-dl` (line 100–112)
- **TARGET STYLE**: Kapsul Royal Sapphire Blue 3D dengan border perak
- **CSS TO CHANGE**:
```css
background: linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%);
border: 1px solid #93c5fd;
color: #ffffff;
box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 2px 6px rgba(0, 0, 0, 0.4);
```

---

### ELEMENT 5 — Brand Bar (Header Row)
- **COMPONENT**: Header bar
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.brand-bar` (line 115–122)
- **TARGET STYLE**: Midnight Sapphire gradient pekat
- **CSS TO CHANGE**:
```css
background: linear-gradient(180deg, #0b1526 0%, #050b14 100%);
border-bottom: 1px solid #1e3a8a;
```

---

### ELEMENT 6 — Brand Title (GASTERUS)
- **COMPONENT**: Brand logo text
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.brand-title` (line 124–136)
- **TARGET STYLE**: Polished Silver / Platinum gradient text dengan bayangan safir
- **CSS TO CHANGE**:
```css
background: linear-gradient(180deg, #ffffff 0%, #e2e8f0 50%, #94a3b8 100%);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
filter: drop-shadow(0 2px 8px rgba(37, 99, 235, 0.5));
```

---

### ELEMENT 7 — Live Chat Button di Header
- **COMPONENT**: Live Chat capsule
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.btn-livechat` (line 138–152)
- **TARGET STYLE**: Kapsul Platinum / Polished Silver 3D dengan teks dark navy
- **CSS TO CHANGE**:
```css
background: linear-gradient(180deg, #ffffff 0%, #e2e8f0 60%, #cbd5e1 100%);
color: #071120;
border: 1px solid #ffffff;
font-weight: 900;
box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
```

---

### ELEMENT 8 — Marquee Bar (Ticker)
- **COMPONENT**: Running text bar
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.marquee-bar` (line 155–163) & `.marquee-inner` (line 165–171)
- **TARGET STYLE**: Background hitam safir dengan teks silver bersih
- **CSS TO CHANGE**:
```css
.marquee-bar {
  background: #040810;
  border-top: 1px solid #1e3a8a;
  border-bottom: 1px solid #1e3a8a;
}
.marquee-inner {
  color: #f1f5f9;
  font-weight: 700;
  letter-spacing: 0.5px;
}
```

---

### ELEMENT 9 — Site Wrapper & Body Background
- **COMPONENT**: App background
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `body` (line 18–26) & `.site` (line 28–43)
- **TARGET STYLE**: Midnight Sapphire Velvet dengan pendaran safir royal
- **CSS TO CHANGE**:
```css
body {
  background: #050b14;
  color: #f8fafc;
}
.site {
  background: #050b14;
  background-image: 
    radial-gradient(circle at 50% 0%, rgba(37, 99, 235, 0.35) 0%, transparent 60%),
    radial-gradient(circle at 100% 100%, rgba(56, 189, 248, 0.12) 0%, transparent 50%),
    linear-gradient(180deg, #050b14 0%, #0a1526 40%, #050b14 100%);
  border-left: 1px solid #1e293b;
  border-right: 1px solid #1e293b;
  box-shadow: 0 0 35px rgba(0, 0, 0, 0.9);
}
```

---

### ELEMENT 10 — Hero Banner Container Frame
- **COMPONENT**: Hero promo frame
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.hero-banner-3d` (line 173–184) & `.banner-container` (line 186–200)
- **TARGET STYLE**: Frame deep sapphire berbingkai silver & pendaran safir
- **CSS TO CHANGE**:
```css
.banner-container {
  background: linear-gradient(135deg, #0f203c 0%, #071120 100%);
  border: 1.5px solid #38bdf8;
  border-radius: 12px;
  box-shadow: 0 0 16px rgba(56, 189, 248, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.2);
}
.banner-badge {
  background: linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%);
  color: #071120;
  font-weight: 900;
  border-radius: 999px;
}
.banner-heading {
  color: #ffffff;
  text-shadow: 0 2px 10px rgba(56, 189, 248, 0.6);
}
.banner-sub {
  color: #cbd5e1;
}
```

---

### ELEMENT 11 — Quick Menu Grid (5 Tiles: RTP, Prediksi, dll)
- **COMPONENT**: 5 Quick Menu Tiles
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.qm-item` (line 243–260) & `.qm-label` (line 272–279)
- **TARGET STYLE**: Kartu Deep Sapphire berbingkai Silver/Ice Sapphire
- **CSS TO CHANGE**:
```css
.qm-item {
  background: linear-gradient(180deg, #112240 0%, #08111e 100%);
  border: 1.5px solid rgba(203, 213, 225, 0.35);
  border-radius: 8px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 4px 10px rgba(0, 0, 0, 0.55);
}
.qm-label {
  color: #f1f5f9;
  font-weight: 800;
  text-shadow: 0 1px 2px #000;
}
```

---

### ELEMENT 12 — Login Section Container
- **COMPONENT**: Form Login wrapper
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.login-section` (line 282–288) & `.login-title` (line 290–298)
- **TARGET STYLE**: Transparan lembut dengan border pemisah midnight sapphire
- **CSS TO CHANGE**:
```css
.login-section {
  background: rgba(7, 17, 34, 0.88);
  border-top: 1px solid #1e3a8a;
  border-bottom: 1px solid #1e3a8a;
}
.login-title {
  color: #f8fafc;
}
```

---

### ELEMENT 13 — Login Input Wrap & Focus Ring
- **COMPONENT**: Input kapsul form login
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.inp-wrap` (line 301–314) & `.inp-wrap:focus-within` (line 316–319)
- **TARGET STYLE**: Kapsul putih bersih dengan glow Ice Sapphire saat aktif
- **CSS TO CHANGE**:
```css
.inp-wrap {
  background: #ffffff;
  border-radius: 999px;
  border: 1.5px solid transparent;
}
.inp-wrap:focus-within {
  border-color: #38bdf8;
  box-shadow: 0 0 14px rgba(56, 189, 248, 0.6);
}
```

---

### ELEMENT 14 — Badge Ikon Input (User & Password)
- **COMPONENT**: Kotak ikon kiri input (`👤` / `🔒`)
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.inp-icon` (line 322–334)
- **TARGET STYLE**: Polished Silver / Platinum badge dengan ikon Dark Navy
- **CSS TO CHANGE**:
```css
.inp-icon {
  background: linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%);
  color: #071120;
  border-right: 1px solid #cbd5e1;
  font-size: 18px;
}
```

---

### ELEMENT 15 — Checkbox Lite Mode
- **COMPONENT**: Lite mode option
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.lite-mode` (line 381–391) & `.lite-mode input` (line 393–398)
- **TARGET STYLE**: Teks silver dengan centang aksen Ice Sapphire
- **CSS TO CHANGE**:
```css
.lite-mode {
  color: #cbd5e1;
}
.lite-mode input[type="checkbox"] {
  accent-color: #38bdf8;
}
```

---

### ELEMENT 16 — Tombol Log in (Platinum / Silver 3D Pill)
- **COMPONENT**: Main login submit button
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.btn-login` (line 401–420)
- **TARGET STYLE**: Kapsul Polished Silver / Platinum 3D Mewah dengan teks Dark Navy
- **CSS TO CHANGE**:
```css
.btn-login {
  background: linear-gradient(180deg, #ffffff 0%, #e2e8f0 50%, #cbd5e1 100%);
  color: #071120;
  border: none;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 0.6px;
  box-shadow: 0 3px 0 #94a3b8, 0 6px 16px rgba(0, 0, 0, 0.6);
}
.btn-login:active {
  transform: translateY(2px);
  box-shadow: 0 1px 0 #94a3b8, 0 2px 6px rgba(0, 0, 0, 0.6);
}
```

---

### ELEMENT 17 — Tombol Daftar (Royal Sapphire Blue 3D Pill)
- **COMPONENT**: Register CTA button
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.btn-daftar` (line 427–446)
- **TARGET STYLE**: Kapsul Royal Sapphire Blue 3D berkilau dengan teks putih tebal
- **CSS TO CHANGE**:
```css
.btn-daftar {
  background: linear-gradient(180deg, #3b82f6 0%, #1d4ed8 55%, #1e3a8a 100%);
  color: #ffffff;
  border: none;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 0.6px;
  border-top: 1px solid rgba(255, 255, 255, 0.45);
  box-shadow: 0 3px 0 #172554, 0 6px 16px rgba(0, 0, 0, 0.6);
}
.btn-daftar:active {
  transform: translateY(2px);
  box-shadow: 0 1px 0 #172554, 0 2px 6px rgba(0, 0, 0, 0.6);
}
```

---

### ELEMENT 18 — Search Area Burger Button
- **COMPONENT**: Tombol hamburger bar
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.btn-burger-square` (line 474–488)
- **TARGET STYLE**: Kotak Royal Sapphire dengan border Polished Silver
- **CSS TO CHANGE**:
```css
background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
border: 1.5px solid #cbd5e1;
color: #ffffff;
```

---

### ELEMENT 19 — Domain Search Pill (WWW.GASTERUS.FUN)
- **COMPONENT**: Domain capsule bar
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.domain-pill` (line 490–503) & `.domain-pill-text` (line 509–516)
- **TARGET STYLE**: Kapsul hitam pekat berbingkai Polished Silver dengan teks Ice Sapphire
- **CSS TO CHANGE**:
```css
.domain-pill {
  background: #020610;
  border: 2px solid #cbd5e1;
}
.domain-pill-icon {
  color: #38bdf8;
}
.domain-pill-text {
  color: #38bdf8;
  font-weight: 900;
  letter-spacing: 1px;
}
```

---

### ELEMENT 20 — Wide CTA Buttons ("Keluhan Member" & "Jadwal Pasaran")
- **COMPONENT**: Tombol lebar
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.btn-wide-gold` (line 518–535)
- **TARGET STYLE**: Kapsul Polished Silver / Platinum 3D Mewah (Ganti dari Gold ke Silver)
- **CSS TO CHANGE**:
```css
.btn-wide-gold {
  background: linear-gradient(180deg, #ffffff 0%, #e2e8f0 55%, #cbd5e1 100%);
  color: #071120;
  border: none;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 800;
  box-shadow: 0 3px 0 #94a3b8, 0 4px 12px rgba(0, 0, 0, 0.45);
}
.btn-wide-gold:active {
  transform: translateY(1px);
  box-shadow: 0 1px 0 #94a3b8, 0 2px 6px rgba(0, 0, 0, 0.45);
}
```

---

### ELEMENT 21 — Kartu Kontak CS 2x2 (WA, FB, LiveChat, Telegram)
- **COMPONENT**: Contact service cards
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.cs-card` (line 561–574), `.cs-icon-wrap` (line 598–608), `.cs-info small` (line 629–634)
- **TARGET STYLE**: Kapsul Metalik Silver/Slate Gelap 3D + Bevel Perak Bawah + Teks "KLIK DISINI" Putih Emboss
- **CSS TO CHANGE**:
```css
.cs-card {
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border: 1px solid rgba(203, 213, 225, 0.35);
  border-radius: 999px;
  height: 50px;
  box-shadow: inset 0 -2px 0 rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 4px 10px rgba(0, 0, 0, 0.55);
}
.cs-icon-wrap {
  background: transparent;
  border-right: none;
  width: 42px;
  height: 42px;
  border-radius: 50%;
}
.cs-info small {
  color: #ffffff;
  font-weight: 900;
  letter-spacing: 0.5px;
  text-shadow: 0 1px 2px #000;
}
```

---

### ELEMENT 22 — Hasil Terakhir Container (Results Box)
- **COMPONENT**: Live Draw Container
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.results-box` (line 637–644) & `.res-head` (line 646–656)
- **TARGET STYLE**: Background Midnight Sapphire berbingkai Polished Silver
- **CSS TO CHANGE**:
```css
.results-box {
  background: rgba(5, 11, 22, 0.95);
  border: 1.5px solid #cbd5e1;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.7);
}
.res-head {
  border-bottom: 1px solid #1e3a8a;
  color: #ffffff;
}
.live-tag {
  display: none; /* Sesuai target screenshot: bersih tanpa badge biru kedip */
}
```

---

### ELEMENT 23 — Filter Cari Pasaran
- **COMPONENT**: Search input pasaran
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.res-search` (line 692–702) & `.res-search span` (line 703–707)
- **TARGET STYLE**: Kapsul hitam pekat berbingkai Polished Silver
- **CSS TO CHANGE**:
```css
.res-search {
  background: #000000;
  border: 1.5px solid #cbd5e1;
}
.res-search span {
  color: #cbd5e1;
}
```

---

### ELEMENT 24 — Kartu Hasil Pasaran Togel (4 Kolom)
- **COMPONENT**: Grid 4 kolom hasil pasaran
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.res-card` (line 731–738), `.res-name` (line 740–750), `.res-card-body` (line 752–755), `.res-number` (line 763–769)
- **TARGET STYLE**:
  - Bingkai kartu: Royal Sapphire (`1px solid #2563eb`)
  - Header Pasaran: **Polished Silver Bar** dengan teks Dark Navy
  - Body: Midnight Black-Sapphire (`#040810`)
  - Angka: **Ice Sapphire Blue** (`#38bdf8`) / Putih Berpendar
- **CSS TO CHANGE**:
```css
.res-card {
  background: #040810;
  border: 1px solid #2563eb;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}
.res-name {
  background: linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%);
  color: #071120;
  font-size: 8px;
  font-weight: 900;
  padding: 3px 2px;
  border-bottom: 1px solid #cbd5e1;
}
.res-card-body {
  background: #040810;
  padding: 4px 2px 5px;
}
.res-number {
  color: #38bdf8;
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 1px;
  text-shadow: 0 0 8px rgba(56, 189, 248, 0.65);
}
```

---

### ELEMENT 25 — Tombol Show More Results
- **COMPONENT**: Expand results button
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.btn-more` (line 771–783)
- **TARGET STYLE**: Kapsul Royal Sapphire Blue 3D dengan border Ice Sapphire
- **CSS TO CHANGE**:
```css
.btn-more {
  background: linear-gradient(180deg, #2563eb 0%, #1e40af 100%);
  border: 1px solid #60a5fa;
  color: #ffffff;
  border-radius: 6px;
  font-weight: 800;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}
```

---

### ELEMENT 26 — Bank Status Grid & Kartu Bank (2 Kolom Kapsul Hitam)
- **COMPONENT**: Bank grid & cards
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.banks-grid` (line 804–808), `.bank-card` (line 810–820), `.bank-badge-online` (line 822–831), `.bank-logo-img` (line 833–837)
- **TARGET STYLE**: **2 KOLOM Kapsul Hitam** + Lampu Oval Hijau di kiri + Kotak Putih Logo di kanan
- **CSS TO CHANGE**:
```css
.banks-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
.bank-card {
  background: #040810;
  border-radius: 6px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 6px;
  border: 1px solid #1e293b;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
}
.bank-badge-online {
  background: #000000;
  border: 1.5px solid #10b981;
  width: 32px;
  height: 14px;
  border-radius: 999px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
}
.bank-badge-online::after {
  content: '';
  width: 14px;
  height: 6px;
  background: #10b981;
  border-radius: 999px;
  box-shadow: 0 0 8px #10b981;
}
.bank-logo-img {
  background: #ffffff;
  border-radius: 4px;
  height: 28px;
  padding: 2px 8px;
  max-width: 90px;
  object-fit: contain;
}
```

---

### ELEMENT 27 — Bank Legend Bar
- **COMPONENT**: Legend online/gangguan/offline
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `.bank-legend` (line 839–849)
- **TARGET STYLE**: Kapsul hitam pekat dengan border Polished Silver
- **CSS TO CHANGE**:
```css
background: #020610;
border: 1.5px solid #cbd5e1;
color: #ffffff;
```

---

### ELEMENT 28 — Footer Halaman
- **COMPONENT**: Page footer
- **CSS FILE**: `mobile-blue.css`
- **EXISTING SELECTOR**: `footer` (line 920–929) & `.footer-links` (line 930–941)
- **TARGET STYLE**: Ultra deep midnight sapphire, sembunyikan `.footer-links`
- **CSS TO CHANGE**:
```css
footer {
  background: #03070d;
  border-top: 1px solid #1e293b;
  color: #94a3b8;
  font-size: 10px;
  text-align: center;
  padding: 14px 10px 10px;
}
.footer-links {
  display: none; /* Sesuai target screenshot: bersih 1 baris copyright */
}
```

---

## 🛠️ INSTRUKSI STEP-BY-STEP UNTUK CLINE (EXECUTOR)

Cline cukup membuka satu file: [`frontend/css/mobile-blue.css`](file:///e:/gas%20terus%2025/gasterus-v3/frontend/css/mobile-blue.css) dan menjalankan urutan berikut:

### 1. FIND & MODIFY
Cari selector yang tertera di setiap nomor elemen di atas, lalu ganti property declaration sesuai blok CSS TO CHANGE.

### 2. CLEANUP
- Hapus semua sisa warna merah maron (`#7f1d1d`, `#dc2626`, `#3b0000`, `#b91c1c`, `#450a0a`).
- Hapus semua sisa warna kuning/gold lama (`#fbbf24`, `#eab308`, `#fde047`, `#ffe066`, `#a47600`, `#b45309`) dan gantikan ke palet **Polished Silver (`#ffffff` / `#cbd5e1`)** atau **Ice Sapphire (`#38bdf8`)**.

### 3. VERIFY
Buka `frontend/index.html` dan pastikan:
- [ ] Nuansa keseluruhan berkarakter **Blue Safir & Metallic Silver** yang mewah dan elegan.
- [ ] Tombol Log in berkilau Platinum/Silver 3D, Tombol Daftar berwarna Royal Sapphire 3D.
- [ ] Form login memiliki badge ikon perak yang bersih.
- [ ] Kartu CS berupa kapsul metalik dengan bevel perak di bawah.
- [ ] Grid bank status tampil dalam **2 kolom rapi**.
- [ ] Kartu hasil draw 4 kolom memiliki header silver dan angka Ice Sapphire berpendar.
- [ ] Footer bersih 1 baris copyright.
