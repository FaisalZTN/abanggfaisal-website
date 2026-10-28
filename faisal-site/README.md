# abangfaisal. — Website personal

Implementasi statis Hybrid Editorial × Modern untuk Cloudflare Pages. Python 3, tanpa dependensi build eksternal, font sistem, tanpa database. Kode dan konten awal berasal dari aset publik situs pada 28 Oktober 2026; ini bukan salinan repositori atau konfigurasi Cloudflare yang terpasang.

## Menjalankan

- Produksi: `python3 build.py` → `dist/`. Draft tidak ikut terbit.
- Review contoh: `PREVIEW_CONTENT=1 python3 build.py`. Seluruh halaman diberi noindex dan banner pratinjau. Jangan gunakan variabel ini pada produksi.
- Serve `dist/` memakai static server pilihan Anda.
- `python3 check.py` memeriksa build produksi dan contoh, tautan internal, escaping, metadata dan isolasi draft.

## CMS tanpa mengedit kode

Konfigurasi Decap CMS tersedia di `/admin/`, tetapi LOGIN BELUM AKTIF. Isi `repo`, `base_url` dan penyedia OAuth setelah repositori serta akses akun disetujui. Decap GitHub memerlukan layanan autentikasi OAuth eksternal; hosting statis saja tidak menyelesaikan login. Pilih implementasi yang ditinjau keamanannya dari dokumentasi resmi Decap, atau layanan autentikasi terkelola dengan biaya yang diperiksa saat setup. Jangan menaruh client secret atau token di public/, JSON, Git, atau browser.

Alur setelah setup: buka `/admin/` → login → Journal / Produk → New → isi form → simpan sebagai draft atau published. Commit CMS memicu rebuild Pages bila Git integration diaktifkan. Berkas JSON adalah data, bukan kode. Draft belum terbit ke situs, tetapi BUKAN penyimpanan rahasia: gunakan repo private dan jangan simpan catatan sensitif. Mengubah published menjadi draft menghapus halaman dari build berikutnya. Slug harus unik dan stabil; buat redirect jika menggantinya. Paragraf artikel mendukung teks biasa untuk tahap awal; formatting kaya dan upload gambar sampul belum diimplementasikan.

## Shop

Halaman detail memuat deskripsi, format, lisensi, harga, dan URL checkout HTTPS. Tanpa URL checkout, halaman menampilkan Segera hadir. Masukkan URL produk dari penyedia checkout yang Anda pilih setelah akun dan ketentuannya siap. Penyedia tersebut harus menangani pembayaran, verifikasi transaksi, dan pengiriman berkas; ketiganya tidak diimplementasikan dalam situs ini. Jangan menaruh e-book berbayar di public/uploads karena folder tersebut bisa diakses semua orang. Biaya transaksi mengikuti penyedia; belum ada integrasi pembayaran atau transaksi yang diuji.

## Cloudflare Pages: langkah setelah persetujuan

1. Identifikasi proyek Pages saat ini: nama proyek, mode upload/Git, repo dan branch, build settings, custom domain, environment variables, serta deployment terakhir yang sehat. Jangan membuat proyek pengganti sebelum memeriksa ini.
2. Simpan sumber asli dan catat deployment untuk rollback. Paket ini bukan backup penuh proyek saat ini.
3. Tambahkan implementasi ke branch review dari repo yang benar. JANGAN push ke branch produksi yang memiliki auto-deploy sebelum persetujuan deployment.
4. Git integration: build command `python3 build.py`; output `dist`; branch produksi sesuai proyek yang ada, lazimnya `main`. Periksa Python 3 tersedia pada build image. Jangan set PREVIEW_CONTENT pada produksi.
5. Uji deployment branch melalui URL pratinjau Pages; tautan dan canonical tetap menuju domain utama, noindex preview sebaiknya ditambahkan berdasarkan environment sebelum branch preview dipublikasikan. Tidak ada branch preview Cloudflare yang sudah dibuat pada tahap ini.
6. Setelah persetujuan terpisah, deploy commit yang telah ditinjau. Untuk proyek Direct Upload, build produksi dan upload ISI dist ke proyek yang telah diverifikasi; jangan menganggap proyek Direct Upload bisa langsung dialihkan ke Git integration.
7. Jika custom domain sudah terhubung ke proyek yang benar, pertahankan. Verifikasi statusnya tanpa mengubah DNS. Jika perlu pemindahan domain atau record DNS, minta persetujuan baru dengan record dan dampak yang spesifik.
8. Uji HTTPS, Home/Journal/Shop/About, deep link, 404 asli, hash lama, mobile/tablet, tema, login CMS, satu publish/unpublish percobaan dan checkout sandbox. Rollback ke deployment sehat bila gagal. Jangan menghapus proyek lama.

## Sebelum go-live

Setujui teks About dan desain. Isi artikel asli serta produk nyata; semua konten contoh berstatus draft. Konfigurasi OAuth/CMS dan ujikan login/publish; pilih checkout dan ujikan pembayaran sandbox/pengiriman; periksa ketentuan lisensi, dukungan dan pengembalian dana produk. Homepage produksi akan menampilkan keadaan kosong Journal/Shop sampai konten diterbitkan. Tidak ada email kontak rekaan.

## Referensi

- https://developers.cloudflare.com/pages/framework-guides/deploy-anything/
- https://developers.cloudflare.com/pages/configuration/git-integration/
- https://decapcms.org/docs/github-backend/
- https://decapcms.org/docs/external-oauth-clients/

## Hasil QA lanjutan

Lihat MOBILE-PERFORMANCE.md untuk cakupan, hasil pengujian responsive viewport, perbaikan header 320 px dan area tekan navigasi, serta batas pengukuran performa lokal.
