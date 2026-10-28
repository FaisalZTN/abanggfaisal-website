# Pengujian mobile dan performa — 28 Oktober 2026

## Metode dan cakupan

Versi pengembangan diuji di Chrome melalui iframe berukuran tetap: 320, 360, 390, 600, 768, dan 1024 px, tinggi 780 px. Scrollbar desktop mengambil 15 px sehingga lebar konten yang terukur adalah 305, 345, 375, 585, 753, dan 1009 px. Ini pengujian responsive viewport, bukan emulasi hardware/layar sentuh/DPR dan bukan perangkat fisik Android atau iOS. Tidak ada CPU/network throttling atau Lighthouse. Tidak ada perubahan website publik.

Tujuh jenis halaman: Home, Journal, Shop, About, satu artikel, satu produk, dan 404. Total 42 kombinasi. Konten contoh ditampilkan melalui mode preview agar kondisi grid, pencarian dan halaman detail dapat diuji; produksi tidak menampilkan draft.

## Hasil layout

| Lebar frame | Lebar konten | Grid koleksi | Overflow horizontal pada 7 halaman |
|---|---|---|---|
| 320 | 305 | 1 kolom | Tidak ditemukan |
| 360 | 345 | 1 kolom | Tidak ditemukan |
| 390 | 375 | 1 kolom | Tidak ditemukan |
| 600 | 585 | 1 kolom | Tidak ditemukan |
| 768 | 753 | 2 kolom | Tidak ditemukan |
| 1024 | 1009 | 3 kolom | Tidak ditemukan |

Visual Home 360, Journal 320, dan Journal tablet diperiksa. Menu muncul pada lebar kecil dan navigasi desktop tampil pada tablet. Pada layar 320, tombol tema awalnya turun ke baris kedua; ukuran brand/gap/menu diperkecil khusus di bawah 360 px. Area tekan tautan menu dan footer mobile diperbesar menjadi tinggi minimum 44 px; tinggi footer diverifikasi dari bounding box browser. Perubahan ini tidak menambahkan aset atau dependensi.

Interaksi di frame smartphone: buka menu menghasilkan aria-expanded=true; Escape menghasilkan false. Pencarian tidak cocok menghasilkan 0 hasil; reset lalu pilih Learning menghasilkan 1 hasil. Mode gelap telah diverifikasi pada pengujian desktop sebelumnya. Checkout dan CMS belum aktif dan tidak termasuk pengujian ini.

## Performa lokal, bukan skor produksi

Home diukur tiga kali pada top-level Chrome menggunakan PerformanceObserver untuk LCP/CLS/longtask, Paint Timing untuk FCP, dan Navigation Timing untuk load. Setiap sampel dibaca setelah sekitar 1,2 detik sejak load. Pengukuran dilakukan pada server preview, tanpa throttle; cache tidak dikosongkan antar-run. Server preview dan alat QA menyisipkan instrumentation sehingga angka bukan baseline build produksi bersih. Selama pengukuran matriks iframe juga berjalan, sehingga dapat terjadi perebutan CPU. Jangan mengartikan angka ini sebagai pengukuran ponsel.

| Sampel | FCP | LCP sementara | CLS teramati | Load | Long task teramati |
|---|---|---|---|---|---|
| 1 | 288 ms | 288 ms | 0 | 245,9 ms | 0 |
| 2 | 244 ms | 244 ms | 0 | 211,9 ms | 1 / 180 ms |
| 3 | 296 ms | 296 ms | 0 | 249,5 ms | 0 |

Median FCP/LCP sementara 288 ms. Ada satu long task 180 ms pada sampel kedua; penyebabnya belum diatribusikan dan tidak boleh diklaim sebagai nol blocking pada semua run. CLS 0 hanya berlaku pada jendela pengamatan ini. LCP belum difinalisasi saat halaman ditinggalkan. INP, TBT Lighthouse, skor Lighthouse dan data Core Web Vitals lapangan tidak diukur. Timing transfer dari preview/cache tidak digunakan sebagai ukuran aset.

Ukuran file bersih dan estimasi gzip dicatat terpisah dalam ASSET-SIZES.json. Estimasi gzip adalah kompresi lokal, bukan jumlah byte transfer produksi yang terverifikasi. Homepage publik membutuhkan HTML, satu CSS dan satu JavaScript lokal; tidak ada font, gambar raster atau library pihak ketiga. Admin CMS terpisah memuat Decap CDN dan tidak termasuk ukuran halaman pengunjung.

## Kesimpulan dan batas verifikasi

Layout responsif dasar dan interaksi mobile yang diuji bekerja. Aset ringan dan render lokal cepat, dengan satu long task yang perlu diperiksa ulang dalam profil produksi bersih. Perlu uji PageSpeed/Lighthouse pada preview Cloudflare setelah deployment diizinkan, cold cache dengan throttling mobile, dan pengujian Android Chrome/iOS Safari nyata. Belum dapat menyatakan skor 100, INP bagus, atau seluruh pengalaman perangkat fisik lolos.
