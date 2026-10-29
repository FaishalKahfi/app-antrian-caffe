# Aplikasi Antrian & POS Caffe Multi-Tenant (`app-pos` & `api-pos`)

Aplikasi manajemen antrian pelanggan caffe, layar monitor TV panggilan barista (dengan suara otomatis TTS Bahasa Indonesia), pemesanan menu mandiri dari meja (*Dine-In* & *Takeaway*), kasir (POS) multi-cabang, modul akuntansi otomatis, serta **Simulasi & Pemodelan Antrian Caffe ($M/M/c$ & Monte Carlo)**.

Dibangun menggunakan arsitektur dan template `sismadi/app-pos` & `sismadi/api-pos` (`engine.js`, `components`/`ui.render`, form drawer geser-kanan `web.openDrawer`, dan backend Cloudflare Worker + D1 `worker.js`).

## Struktur Proyek

```
api-pos/
  schema.sql             -> Skema D1 lengkap (tenants, users, produk, lokasi, lokasi_produk,
                            kontak, distribusi, transaksi, antrian, payment, akun, jurnal, rate_limit)
                            beserta seed data "Kopi Piawai Caffe" (CAFFE01)
  migration_antrian.sql  -> Migrasi non-destruktif untuk menambahkan tabel `antrian` ke D1 yang sudah jalan
  migration_ecommerce.sql-> Migrasi etalase menu online
  worker.js              -> Worker API: CRUD `/api` (termasuk tabel `antrian`) & endpoint publik
                            `/public?view=antrian-status|antrian-ambil|toko-pesan`
  hash-password.mjs      -> CLI pembuat hash password PBKDF2-SHA256
  wrangler.toml          -> Konfigurasi deploy Cloudflare Worker + D1

app-pos/
  index.html             -> Shell SPA utama Caffe Piawai
  style.css, svg.css, svg.js -> Aset UI + ikon SVG caffe/speaker/queue/tv + styling layar TV & tiket termal
  engine.js              -> Mesin render generik (routing, drawer, components, escaping HTML)
  db.js                  -> Lapisan data async (Worker API + Fallback Demo Lokal otomatis)
  auth.js                -> Login Kode Caffe + Captcha Matematika + Akses Cepat Demo 1-Klik
  dataset.js             -> Konfigurasi menu navigasi (`siteConfig`) & loader skrip paralel
  toko.js                -> Katalog Pesan Menu Online & Ambil Tiket Antrian Mandiri (`?toko/<slug>`)
  pages/
    home.js              -> Landing page Sistem Antrian & POS Caffe
    antrian.js           -> Panel Kontrol Antrian & Panggilan Suara Barista (TTS + Chime + Cetak Tiket)
    layar-antrian.js     -> Layar Monitor TV Antrian Caffe Real-time & Kiosk Ambil Antrian Mandiri
    simulasi.js          -> Simulasi & Pemodelan Antrian Caffe (Teori M/M/c Multi-Barista & Monte Carlo)
    kasir.js             -> Layar Kasir Caffe + Pembuatan Nomor Antrian Otomatis
    transaksi.js         -> Riwayat Transaksi Jual/Beli + Konfirmasi Pesanan Online + Link Tiket Antrian
    produk.js            -> CRUD Menu Kopi/Pastry + Estimasi Waktu Racik Barista (menit)
    lokasi.js            -> CRUD Counter Barista & Gudang Bahan Baku + Stok
    distribusi.js        -> Mutasi Stok Bahan Baku Masuk/Keluar
    kontak.js            -> CRUD Member Pelanggan & Supplier Roastery
    akun.js, jurnal.js, laporan.js -> Modul Akuntansi & Laporan Keuangan Otomatis
    dashboard.js         -> KPI Antrian Hari Ini, Penjualan, & Menu Caffe Terlaris
```

## Akun Demo Caffe (Siap Pakai)

| Kode Caffe | Username     | Password     | Peran                  |
|------------|--------------|--------------|------------------------|
| `CAFFE01`  | `owner`      | `owner123`   | Owner Caffe            |
| `CAFFE01`  | `kasir`      | `kasir123`   | Kasir & Barista        |
| `CAFFE01`  | `barista`    | `barista123` | Head Barista / Gudang  |
| `SUPERADMIN` | `superadmin` | `super123` | Superadmin             |

## Cara Menjalankan Secara Lokal

1. Jalankan server statis pada folder `app-pos` (misalnya dengan Node.js atau ekstensi Live Server):
   ```bash
   npx serve app-pos -l 8080
   ```
2. Buka `http://localhost:8080` di browser.
3. Anda dapat langsung membuka **Layar Antrian (`?layar-antrian`)**, **Pesan Menu (`?toko/kopi-piawai`)**, atau klik tombol **Masuk Cepat Demo** di halaman **Masuk Staf (`?login`)**.
