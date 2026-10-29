# abangfaisal.my.id

Website statis Python 3 untuk Cloudflare Pages, GitHub dan Decap CMS. Build dari direktori `faisal-site`: `python3 build.py`; output `dist/`. Tidak ada dependency build baru. OAuth GitHub melalui Worker yang sudah aktif tetap dipertahankan.

## Mengelola tulisan

1. Buka `/admin/`, login seperti biasa, pilih Journal.
2. Isi judul, slug, tanggal, kategori, ringkasan. Jangan mengganti slug artikel terbit karena slug menentukan URL.
3. Artikel lama tetap memakai Paragraf lama. Untuk memakai editor baru, salin isi ke Isi tulisan lalu format sesuai toolbar. Jika editor baru terisi, ia menjadi sumber tampilan; data paragraf lama tetap tersimpan. Kosongkan editor baru untuk kembali ke paragraf lama.
4. Gunakan baris kosong antarparagraf, heading, quote dan bullet list. Heading 2/3, bold, italic, HTTPS link dan list sederhana didukung. HTML/embed/tabel/nested list tidak didukung.
5. Pilih cover opsional dan isi deskripsi gambar. Gunakan nama file tanpa spasi, JPG/PNG/WebP/AVIF/GIF lokal. Usahakan 1200×800 dan <300 KB. Gambar diunggah ke folder publik, bukan penyimpanan produk berbayar.
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
