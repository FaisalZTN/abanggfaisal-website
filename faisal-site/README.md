# abangfaisal.my.id

Website statis Python 3 untuk Cloudflare Pages, GitHub dan Decap CMS. Build dari direktori `faisal-site`: `python3 build.py`; output `dist/`. Dependency build dikunci pada requirements.txt (Pillow 12.3.0, Mistune 3.4.0). Build memasang versi tersebut ke .build-deps bila belum tersedia; command Pages tetap python3 build.py. Build pertama memerlukan akses PyPI, selanjutnya memakai paket yang sudah tersedia. OAuth GitHub melalui Worker yang sudah aktif tetap dipertahankan.

## Mengelola tulisan

1. Buka `/admin/`, login seperti biasa, pilih Journal.
2. Isi judul, slug, tanggal, kategori, ringkasan. Jangan mengganti slug artikel terbit karena slug menentukan URL.
3. Artikel lama tetap memakai Paragraf lama. Untuk memakai editor baru, salin isi ke Isi tulisan lalu format sesuai toolbar. Jika editor baru terisi, ia menjadi sumber tampilan; data paragraf lama tetap tersimpan. Kosongkan editor baru untuk kembali ke paragraf lama.
4. Gunakan baris kosong antarparagraf, heading, quote dan bullet list. Heading 2–4, bold, italic, dicoret, link HTTPS, daftar bernomor/bertingkat, quote, code inline, blok kode, tabel dan gambar lokal didukung. HTML mentah di-escape; embed pihak ketiga tidak dijalankan.
5. Pilih cover opsional dan isi deskripsi gambar. Gunakan nama file tanpa spasi, JPG/PNG/WebP/AVIF/GIF lokal. Disarankan rasio 3:2 dan unggahan <10 MB. Build menghasilkan WebP otomatis; tidak perlu mengompres setiap file secara manual. Gambar diunggah ke folder publik, bukan penyimpanan produk berbayar.
6. SEO opsional: kosong memakai judul dan ringkasan. Waktu baca dihitung otomatis.
7. Pilih draft atau published lalu simpan. Simpan CMS membuat commit ke main dan dapat langsung memicu deployment. Draft tidak muncul di website; repository publik membuat isi draft tetap bisa dibaca lewat GitHub. Tidak ada penjadwalan terbit otomatis.

## Mengelola produk

Pilih Produk → isi nama, kategori, deskripsi, format, lisensi dan harga rupiah. Nol berarti Gratis. Thumbnail dan daftar preview opsional. Pilih Produk unggulan agar prioritas tampil lebih tinggi di Home.

Status publikasi dan ketersediaan berbeda: draft menyembunyikan halaman; published menampilkannya. Ketersediaan coming-soon/unavailable tidak menampilkan checkout. available wajib memiliki URL HTTPS checkout lengkap. Bila field belum ada (data lama), status mengikuti ada/tidaknya checkout. Memasukkan tautan tidak membuktikan pembayaran atau pengiriman file sudah bekerja. Periksa sandbox penyedia sebelum menjual. Jangan upload berkas berbayar ke folder public/uploads.

## Mengelola profil

Pilih Profil personal → About & kontak. Sunting pengantar, cerita dan bidang minat. Tautan kontak harus URL HTTPS milik Anda dan baru tampil setelah Anda mengaktifkan persetujuan publikasi. Tidak ada alamat kontak rekaan pada versi awal.

## Pengembangan dan review

- Produksi: `python3 build.py`.
- Draft preview lokal: `PREVIEW_CONTENT=1 python3 build.py`; jangan set di produksi.
- `python3 check.py` dan `python3 -m unittest discover -p 'test_*.py' -v`.
- `node --check public/app.js` bila Node tersedia.
- Branch Pages selain main diberi noindex melalui CF_PAGES_BRANCH, tetapi ini bukan kontrol akses.
- Admin preview tetap menunjuk main: jangan menyimpan konten saat mereview PR.
- Lihat REVIEW-2026-10-29.md untuk audit, batas pengujian, dan langkah persetujuan deployment. Dokumen audit 28 Oktober adalah catatan historis.

Merge/deployment produksi hanya sesudah persetujuan pemilik; tidak ada langkah DNS atau penggantian OAuth dalam perubahan ini.

## Kompresi gambar otomatis

Setiap build memproses raster pada public/uploads menjadi varian WebP 480, 960 dan 1440 px (tanpa memperbesar sumber). Browser memilih melalui srcset/sizes. Hanya varian lebih kecil dari sumber yang dipakai. Cover, thumbnail, preview produk dan gambar Markdown memakai pipeline yang sama. Animasi GIF/WebP dilewatkan agar tetap bergerak. File asli dalam repository dan public/uploads tidak diubah atau dihapus; metadata pada file asli masih dapat diakses publik. Salinan WebP membuang metadata dan mengikuti rotasi EXIF. Lihat dist/image-report.json untuk ukuran tiap varian. Kompresi bersifat lossy (quality 82); kualitas perlu ditinjau jika gambar berisi tulisan kecil/diagram presisi. Gambar rusak atau melewati batas decoding menyebabkan build gagal, bukan menerbitkan gambar rusak. Artikel/produk berbayar tetap jangan diunggah ke public/uploads.

## Editor lanjutan

- Gunakan tombol + pada editor untuk Image, Code block, atau Tabel. Tabel menyediakan input judul kolom dan baris; pisahkan kolom dengan tanda |.
- Untuk tabel: baris header, pemisah --- dan baris isi dapat pula ditulis pada mode Markdown. Tampilan visual tabel di editor dapat berbeda dari website; gunakan preview branch untuk memeriksa layout.
- Daftar bertingkat: indentasi subdaftar minimal 3–4 spasi di mode Markdown. Daftar bernomor tersedia di toolbar.
- Kode: gunakan backtick untuk inline atau tiga backtick untuk blok. Kode ditampilkan sebagai teks, tidak dieksekusi; syntax highlighting belum tersedia.
- Gambar inline: pilih gambar lokal dari Media. Format Markdown: ![Deskripsi](/uploads/nama.webp). Gambar jarak jauh ditolak build untuk mencegah permintaan tracking dan menjaga pipeline; unduh/unggah hanya gambar yang Anda berhak gunakan.
- Link mendukung HTTPS. Video/iframe pihak ketiga tidak disisipkan otomatis; gunakan tautan HTTPS biasa.
- Artikel JSON lama (body berupa daftar paragraf, atau article berupa teks Markdown) tetap didukung; tidak ada migrasi konten.

## Uji integrasi Mayar — aktivasi manual

Produk chatgpt-plus-1-bulan memakai published + coming-soon untuk menampilkan halaman tanpa tombol beli aktif. Harga Rp100.000 mengikuti katalog pada pemeriksaan 29 Oktober 2026; cek ulang sebelum membuka penjualan. Checkout saat pemeriksaan menampilkan akun belum terverifikasi.

Field CMS Halaman informasi Mayar menampilkan tautan katalog meskipun belum tersedia. Instruksi pembayaran dan aktivasi menggantikan keterangan pengiriman file; produk lama tetap kompatibel. Redirect Telegram @Faysaruu memerlukan pembeli mengirim pesan sendiri. Aktivasi manual. Tidak ada bot, webhook, API aktivasi atau pengiriman file otomatis.

Setelah KYC disetujui: periksa checkout, harga dan biaya, metode dan estimasi aktivasi serta ketentuan layanan. Transaksi uji memerlukan persetujuan pemilik. Periksa invoice/email, status lunas di dashboard dan redirect Telegram; baru ubah ketersediaan ke available. Simpan CMS menulis ke main dan memicu deployment. Katalog terbuka bukan bukti pembayaran aktif. Merge PR ini memerlukan persetujuan pemilik tersendiri.
