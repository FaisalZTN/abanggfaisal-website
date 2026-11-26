# CLAUDE.md

Panduan pengembangan situs statis `abanggfaisal.my.id`.

## Prinsip

Responsif, fungsional, cepat, minimalis. Hindari overengineering; pertahankan arsitektur yang ada. Jangan akses kredensial, jangan commit/push/merge/deploy tanpa instruksi eksplisit pemilik.

## Arsitektur

Situs statis murni: **build Python 3** (`build.py`) yang membaca JSON konten, merender HTML ke `dist/`, lalu dihosting di **Cloudflare Pages**. Tidak ada framework JS di sisi publik — HTML/CSS/vanilla JS.

- `faisal-site/build.py` — orkestrator build. Copy `public/` ke `dist/`, optimize gambar, render semua halaman, tulis `sitemap.xml` + `robots.txt`. Jalankan dari `faisal-site`: `python3 build.py`.
- `faisal-site/build_deps.py` — pasang dependency build yang di-pin ke `.build-deps/` (Pillow 12.3.0, Mistune 3.4.0) tanpa mengubah command Pages.
- `faisal-site/editorial.py` — normalisasi & validasi konten, render Markdown (mistune) dengan escape ketat; link hanya HTTPS, gambar hanya lokal `/uploads/`.
- `faisal-site/study.py` + `study_calendar.py` — fitur Ruang Belajar: dashboard per-blok, direktori dosen, katalog, tutorial, dan ekspor `.ics` WITA.
- `faisal-site/images.py` — generate varian WebP (480/960/1440) responsif; animasi GIF/WebP dipertahankan; output `dist/image-report.json`.

### Data

Semua konten hidup sebagai JSON di `faisal-site/content/`, dikelola lewat **Decap CMS** (`public/admin/`). Struktur utama:
- `journal/` (tulisan), `products/` (shop digital), `profile.json`,
- Ruang Belajar: `study-blocks/`, `study-lectures/`, `study-teachers/`, `study-tutorials/`, `study-guidelines.json`, `study-comments.json`.
- Skema CMS: `public/admin/config.yml`.

Validasi ketat saat build (slug, URL HTTPS, status, jadwal, relasi antar-blok). Gagal validasi = build gagal — jangan publikasi data rusak.

### Workroom Faysaruworks

Aplikasi terpisah di `/workroom/`, ditenagai **Cloudflare Worker** (`public/_worker.js`) + SQLite (D1) + Access (JWT owner). Halaman: Ringkasan, Hari Ini, Tugas, Catatan (editor Tiptap/blok), Proyek, Goals, Review, Drive, Pengaturan, Catatan Rahasia (enkripsi + 5-menit unlock).
- Integrasi Google Calendar (OAuth, refresh token di DB).
- Aset Workroom (`.js`/`.css`) di `public/`, di-bundle/replace path oleh `build.py`.
- Routing Worker: `public/_routes.json` (`/workroom`, `/api/study-comments`).
- Editor blok: `workroom-block-editor.js` dibundle esbuild saat build (dependensi di `package.json`/`package-lock.json`, Tiptap).
- Runtime secrets (jangan commit): `WORKROOM_PRIVATE_NOTES_PASSWORD`, `WORKROOM_PRIVATE_NOTES_KEY`. Lihat README bagian "Catatan Rahasia".

### Konfigurasi statis

- `public/_headers` — header keamanan global; `noindex` untuk `/admin/*`; `text/calendar` untuk `.ics`.
- `public/style.css` — design system utama. `public/workroom.css` — khusus Workroom.
- Font lokal di `public/fonts/` (Inter, Poppins, Amiri, dll.).
- `public/app.js` — vanilla JS publik: tema gelap, menu, back-to-top, dll.
- `public/_worker.js` — Worker Workroom (sumber; `build.py` men-rewrite path aset-nya).

## Proses build & quality

- Produksi: `python3 build.py` (dari `faisal-site`). Output `dist/`.
- Draft preview lokal: `PREVIEW_CONTENT=1 python3 build.py` — TIDAK untuk produksi.
- Uji integrasi: `python3 check.py` (build prod + preview, validasi link internal, 1 H1, metadata, isolasi draft).
- Unit test: `python3 -m unittest discover -p 'test_*.py' -v`.
- Syntax JS: `node --check public/app.js`.
- Cek mobile/studi: `node check-mobile.cjs`; Workroom: `node check-workroom.cjs` (dari `faisal-site/`).
- CI: `.github/workflows/website-quality.yml` — build + test + Playwright mobile + Lighthouse (mobile & desktop + produksi).

Branch Pages selain `main` diberi `noindex` otomatis via `CF_PAGES_BRANCH` (bukan kontrol akses). Simpan CMS ke `main` → langsung memicu deployment.

## Aturan konten

- **Journal**: slug menentukan URL — jangan ubah slug artikel terbit. Artikel lama = paragraf (`body`); editor baru (`article`, Markdown) menimpa tampilan bila terisi; kosongkan untuk kembali ke `body`.
- **Gambar**: unggah ke `public/uploads/` (bukan storage berbayar). Build auto WebP; jangan kompresi manual. File berbayar jangan di-`public/uploads`.
- **Produk**: `availability` vs `status` berbeda. `available` wajib checkout HTTPS. Jangan upload file berbayar ke publik.
- **Ruang Belajar**: jadwal WITA; transkripsi skenario utuh + sumber; sitasi Vancouver; klinis → periksa PNPK/pedoman profesi Indonesia dulu.
- HTML mentah di-escape; embed pihak ketiga tidak dijalankan.

## Batas (jangan lakukan)

- Jangan commit/push/merge/deploy tanpa persetujuan pemilik.
- Jangan akses atau men-commit secret/kredensial (Workroom runtime secrets, OAuth).
- Jangan ubah arsitektur; tambahkan lewat pola yang ada.
