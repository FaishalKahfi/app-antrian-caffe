// ============================================================
// db.js — Lapisan akses data (fetch ke Worker API backend + Fallback Demo Lokal Caffe)
// VERSI TER-HARDENING/DIOPTIMALKAN — mendukung penuh Cloudflare Worker + D1
// serta penyimpanan lokal otomatis (Local/Offline Caffe Mode) bila API_BASE
// belum dideploy skema tabel `antrian`-nya.
// ============================================================

// GANTI dengan URL hasil `wrangler deploy` di repo api-pos, tanpa slash di akhir.
const API_BASE = 'https://api-antrian-caffe.faishalkahfi041004.workers.dev';

const SCOPED_TABLES = new Set([
    'produk', 'lokasi', 'lokasi_produk', 'kontak',
    'distribusi', 'distribusi_produk',
    'transaksi', 'transaksi_produk',
    'antrian',
    'payment',
    'akun', 'jurnal', 'jurnal_detail',
]);

const LOCAL_DB_KEY = 'caffePosLocalDb_v1';
const LOCAL_MODE_KEY = 'caffePosUseLocalMode';

function isLocalMode() {
    // Jika API_BASE sudah diganti ke URL Cloudflare Worker milik Anda sendiri,
    // otomatis gunakan database D1 Cloudflare (kecuali dipaksa mode lokal).
    if (API_BASE && API_BASE !== 'https://pos.piawai.workers.dev') {
        try { return localStorage.getItem(LOCAL_MODE_KEY) === '1'; } catch (e) { return false; }
    }
    try { return localStorage.getItem(LOCAL_MODE_KEY) !== '0'; } catch (e) { return true; }
}
function setLocalMode(val) {
    try { localStorage.setItem(LOCAL_MODE_KEY, val ? '1' : '0'); } catch (e) {}
    _tableCache.clear();
}

function genLocalId(prefix) {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function minutesAgoIso(mins) {
    return new Date(Date.now() - mins * 60 * 1000).toISOString();
}

function createInitialSeedDb() {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    return {
        tenants: [
            { id: 'system', kodeToko: 'SUPERADMIN', nama: 'Sistem (Superadmin)', alamat: '-', telepon: '-', status: 'aktif', slug: null, deskripsi: null, tampilOnline: 0, createdAt: now },
            { id: 'tnt_demo', kodeToko: 'CAFFE01', nama: 'Kopi Piawai Caffe & Roastery', alamat: 'Jl. Sudirman No. 45, Jakarta', telepon: '081288889999', status: 'aktif', slug: 'kopi-piawai', deskripsi: 'Specialty Coffee, Artisan Pastry & Cozy Workspace. Pesan dari meja atau takeaway dengan pemantauan antrian real-time.', tampilOnline: 1, createdAt: now },
            { id: 'tnt_toko', kodeToko: 'TOKO001', nama: 'Caffe Senja Nusantara', alamat: 'Jl. Merdeka No. 10, Bandung', telepon: '081200001111', status: 'aktif', slug: 'caffe-senja', deskripsi: 'Kopi susu kekinian, manual brew, dan camilan hangat.', tampilOnline: 1, createdAt: now },
        ],
        users: [
            { id: 'usr_super', tenantId: 'system', username: 'superadmin', passwordPlain: 'super123', name: 'Super Admin', role: 'superadmin', createdAt: now },
            { id: 'usr_owner', tenantId: 'tnt_demo', username: 'owner', passwordPlain: 'owner123', name: 'Budi (Owner Caffe)', role: 'owner', createdAt: now },
            { id: 'usr_kasir', tenantId: 'tnt_demo', username: 'kasir', passwordPlain: 'kasir123', name: 'Sari (Kasir & Barista)', role: 'kasir', createdAt: now },
            { id: 'usr_barista', tenantId: 'tnt_demo', username: 'barista', passwordPlain: 'barista123', name: 'Riko (Head Barista)', role: 'gudang', createdAt: now },
            { id: 'usr_owner2', tenantId: 'tnt_toko', username: 'owner', passwordPlain: 'owner123', name: 'Budi Pemilik', role: 'owner', createdAt: now },
            { id: 'usr_kasir2', tenantId: 'tnt_toko', username: 'kasir', passwordPlain: 'kasir123', name: 'Sari Kasir', role: 'kasir', createdAt: now },
        ],
        lokasi: [
            { id: 'lok_toko', tenantId: 'tnt_demo', nama: 'Counter Barista & Kasir Utama', tipe: 'toko', alamat: 'Lantai 1 — Area Dine-In & Takeaway', createdAt: now },
            { id: 'lok_gudang', tenantId: 'tnt_demo', nama: 'Gudang Biji Kopi & Bahan Baku', tipe: 'gudang', alamat: 'Lantai 2 — Ruang Penyimpanan', createdAt: now },
        ],
        produk: [
            { id: 'prd_kopsus', tenantId: 'tnt_demo', kode: 'CF001', nama: 'Es Kopi Susu Gula Aren', kategori: 'Signature Coffee', satuan: 'cup', hargaBeli: 10000, hargaJual: 24000, estimasiMenit: 3, aktif: 1, createdAt: now },
            { id: 'prd_latte', tenantId: 'tnt_demo', kode: 'CF002', nama: 'Hot Caffe Latte', kategori: 'Espresso Based', satuan: 'cup', hargaBeli: 12000, hargaJual: 28000, estimasiMenit: 4, aktif: 1, createdAt: now },
            { id: 'prd_americano', tenantId: 'tnt_demo', kode: 'CF003', nama: 'Iced Americano', kategori: 'Espresso Based', satuan: 'cup', hargaBeli: 8000, hargaJual: 22000, estimasiMenit: 2, aktif: 1, createdAt: now },
            { id: 'prd_caramel', tenantId: 'tnt_demo', kode: 'CF004', nama: 'Caramel Macchiato', kategori: 'Signature Coffee', satuan: 'cup', hargaBeli: 14000, hargaJual: 32000, estimasiMenit: 5, aktif: 1, createdAt: now },
            { id: 'prd_v60', tenantId: 'tnt_demo', kode: 'CF005', nama: 'Manual Brew V60 Arabica', kategori: 'Manual Brew', satuan: 'cup', hargaBeli: 15000, hargaJual: 35000, estimasiMenit: 6, aktif: 1, createdAt: now },
            { id: 'prd_matcha', tenantId: 'tnt_demo', kode: 'NC001', nama: 'Iced Matcha Latte', kategori: 'Non-Coffee', satuan: 'cup', hargaBeli: 13000, hargaJual: 29000, estimasiMenit: 4, aktif: 1, createdAt: now },
            { id: 'prd_choco', tenantId: 'tnt_demo', kode: 'NC002', nama: 'Belgian Dark Chocolate', kategori: 'Non-Coffee', satuan: 'cup', hargaBeli: 13000, hargaJual: 28000, estimasiMenit: 4, aktif: 1, createdAt: now },
            { id: 'prd_croissant', tenantId: 'tnt_demo', kode: 'SN001', nama: 'Butter Croissant', kategori: 'Pastry & Snack', satuan: 'pcs', hargaBeli: 11000, hargaJual: 25000, estimasiMenit: 3, aktif: 1, createdAt: now },
            { id: 'prd_fries', tenantId: 'tnt_demo', kode: 'SN002', nama: 'Truffle French Fries', kategori: 'Pastry & Snack', satuan: 'porsi', hargaBeli: 12000, hargaJual: 27000, estimasiMenit: 6, aktif: 1, createdAt: now },
            { id: 'prd_toast', tenantId: 'tnt_demo', kode: 'SN003', nama: 'Kaya Butter Toast', kategori: 'Pastry & Snack', satuan: 'porsi', hargaBeli: 10000, hargaJual: 23000, estimasiMenit: 5, aktif: 1, createdAt: now },
        ],
        lokasi_produk: [
            { id: 'lp1', tenantId: 'tnt_demo', lokasiId: 'lok_toko', produkId: 'prd_kopsus', stok: 85, stokMinimum: 15 },
            { id: 'lp2', tenantId: 'tnt_demo', lokasiId: 'lok_toko', produkId: 'prd_latte', stok: 60, stokMinimum: 10 },
            { id: 'lp3', tenantId: 'tnt_demo', lokasiId: 'lok_toko', produkId: 'prd_americano', stok: 70, stokMinimum: 10 },
            { id: 'lp4', tenantId: 'tnt_demo', lokasiId: 'lok_toko', produkId: 'prd_caramel', stok: 45, stokMinimum: 10 },
            { id: 'lp5', tenantId: 'tnt_demo', lokasiId: 'lok_toko', produkId: 'prd_v60', stok: 30, stokMinimum: 8 },
            { id: 'lp6', tenantId: 'tnt_demo', lokasiId: 'lok_toko', produkId: 'prd_matcha', stok: 50, stokMinimum: 10 },
            { id: 'lp7', tenantId: 'tnt_demo', lokasiId: 'lok_toko', produkId: 'prd_choco', stok: 45, stokMinimum: 10 },
            { id: 'lp8', tenantId: 'tnt_demo', lokasiId: 'lok_toko', produkId: 'prd_croissant', stok: 25, stokMinimum: 5 },
            { id: 'lp9', tenantId: 'tnt_demo', lokasiId: 'lok_toko', produkId: 'prd_fries', stok: 40, stokMinimum: 8 },
            { id: 'lp10', tenantId: 'tnt_demo', lokasiId: 'lok_toko', produkId: 'prd_toast', stok: 35, stokMinimum: 8 },
            { id: 'lp11', tenantId: 'tnt_demo', lokasiId: 'lok_gudang', produkId: 'prd_kopsus', stok: 200, stokMinimum: 40 },
            { id: 'lp12', tenantId: 'tnt_demo', lokasiId: 'lok_gudang', produkId: 'prd_latte', stok: 150, stokMinimum: 30 },
        ],
        kontak: [
            { id: 'kon_sup1', tenantId: 'tnt_demo', nama: 'PT Nusantara Coffee Roasters', tipe: 'supplier', telepon: '081300000001', alamat: 'Jl. Kopi Arabika No. 10', email: 'roastery@example.com', createdAt: now },
            { id: 'kon_cust1', tenantId: 'tnt_demo', nama: 'Kak Andi Pratama (Member)', tipe: 'customer', telepon: '081400000002', alamat: 'Meja 03', email: 'andi@example.com', createdAt: now },
            { id: 'kon_cust2', tenantId: 'tnt_demo', nama: 'Kak Nadia Putri (Member)', tipe: 'customer', telepon: '081400000003', alamat: 'Takeaway', email: 'nadia@example.com', createdAt: now },
        ],
        distribusi: [],
        distribusi_produk: [],
        transaksi: [
            { id: 'trx_demo1', tenantId: 'tnt_demo', nomor: 'TR-CF001', tipe: 'jual', tanggal: today, lokasiId: 'lok_toko', kontakId: 'kon_cust1', status: 'selesai', metodePembayaran: 'qris', totalBayar: 73000, catatan: 'Meja 02 — Less sugar', sumber: 'pos', pembeliNama: 'Dimas Anggara', pembeliTelepon: '08123456701', nomorMeja: 'Meja 02', tipeLayanan: 'dine-in', nomorAntrian: 'A-001', createdAt: minutesAgoIso(25) },
            { id: 'trx_demo2', tenantId: 'tnt_demo', nomor: 'TR-CF002', tipe: 'jual', tanggal: today, lokasiId: 'lok_toko', kontakId: null, status: 'selesai', metodePembayaran: 'tunai', totalBayar: 45000, catatan: 'Takeaway — Extra ice', sumber: 'pos', pembeliNama: 'Sinta Maharani', pembeliTelepon: '08123456702', nomorMeja: 'Takeaway', tipeLayanan: 'takeaway', nomorAntrian: 'B-001', createdAt: minutesAgoIso(18) },
            { id: 'trx_demo3', tenantId: 'tnt_demo', nomor: 'TR-CF003', tipe: 'jual', tanggal: today, lokasiId: 'lok_toko', kontakId: null, status: 'selesai', metodePembayaran: 'qris', totalBayar: 59000, catatan: 'Meja 05', sumber: 'pos', pembeliNama: 'Rizky Pratama', pembeliTelepon: '08123456703', nomorMeja: 'Meja 05', tipeLayanan: 'dine-in', nomorAntrian: 'A-002', createdAt: minutesAgoIso(12) },
            { id: 'trx_demo4', tenantId: 'tnt_demo', nomor: 'TR-CF004', tipe: 'jual', tanggal: today, lokasiId: 'lok_toko', kontakId: 'kon_cust2', status: 'selesai', metodePembayaran: 'tunai', totalBayar: 57000, catatan: 'Meja 01 — Oat milk', sumber: 'pos', pembeliNama: 'Nadia Putri', pembeliTelepon: '08123456704', nomorMeja: 'Meja 01', tipeLayanan: 'dine-in', nomorAntrian: 'A-003', createdAt: minutesAgoIso(8) },
            { id: 'trx_demo5', tenantId: 'tnt_demo', nomor: 'ON-CF005', tipe: 'jual', tanggal: today, lokasiId: 'lok_toko', kontakId: null, status: 'draft', metodePembayaran: 'qris', totalBayar: 76000, catatan: 'Pesanan dari etalase online (A-004)', sumber: 'online', pembeliNama: 'Ayu Lestari', pembeliTelepon: '08123456706', pembeliAlamat: 'Meja 08 — Normal ice', nomorMeja: 'Meja 08', tipeLayanan: 'dine-in', nomorAntrian: 'A-004', createdAt: minutesAgoIso(3) },
        ],
        transaksi_produk: [
            { id: 'tp_1', tenantId: 'tnt_demo', transaksiId: 'trx_demo1', produkId: 'prd_kopsus', qty: 2, hargaSatuan: 24000, subtotal: 48000 },
            { id: 'tp_2', tenantId: 'tnt_demo', transaksiId: 'trx_demo1', produkId: 'prd_croissant', qty: 1, hargaSatuan: 25000, subtotal: 25000 },
            { id: 'tp_3', tenantId: 'tnt_demo', transaksiId: 'trx_demo2', produkId: 'prd_americano', qty: 1, hargaSatuan: 22000, subtotal: 22000 },
            { id: 'tp_4', tenantId: 'tnt_demo', transaksiId: 'trx_demo2', produkId: 'prd_toast', qty: 1, hargaSatuan: 23000, subtotal: 23000 },
            { id: 'tp_5', tenantId: 'tnt_demo', transaksiId: 'trx_demo3', produkId: 'prd_caramel', qty: 1, hargaSatuan: 32000, subtotal: 32000 },
            { id: 'tp_6', tenantId: 'tnt_demo', transaksiId: 'trx_demo3', produkId: 'prd_fries', qty: 1, hargaSatuan: 27000, subtotal: 27000 },
            { id: 'tp_7', tenantId: 'tnt_demo', transaksiId: 'trx_demo4', produkId: 'prd_latte', qty: 1, hargaSatuan: 28000, subtotal: 28000 },
            { id: 'tp_8', tenantId: 'tnt_demo', transaksiId: 'trx_demo4', produkId: 'prd_matcha', qty: 1, hargaSatuan: 29000, subtotal: 29000 },
            { id: 'tp_9', tenantId: 'tnt_demo', transaksiId: 'trx_demo5', produkId: 'prd_kopsus', qty: 2, hargaSatuan: 24000, subtotal: 48000 },
            { id: 'tp_10', tenantId: 'tnt_demo', transaksiId: 'trx_demo5', produkId: 'prd_choco', qty: 1, hargaSatuan: 28000, subtotal: 28000 },
        ],
        antrian: [
            { id: 'ant_1', tenantId: 'tnt_demo', transaksiId: 'trx_demo1', nomorAntrian: 'A-001', kodePrefix: 'A', urutan: 1, tanggal: today, namaPelanggan: 'Dimas Anggara', telepon: '08123456701', nomorMeja: 'Meja 02', tipeLayanan: 'dine-in', loket: 'Barista 1', status: 'selesai', estimasiMenit: 4, ringkasanPesanan: '2x Es Kopi Susu Gula Aren, 1x Butter Croissant', catatan: 'Less sugar', waktuAmbil: minutesAgoIso(25), waktuPanggil: minutesAgoIso(22), waktuSiap: minutesAgoIso(17), waktuSelesai: minutesAgoIso(16), createdAt: minutesAgoIso(25) },
            { id: 'ant_2', tenantId: 'tnt_demo', transaksiId: 'trx_demo2', nomorAntrian: 'B-001', kodePrefix: 'B', urutan: 1, tanggal: today, namaPelanggan: 'Sinta Maharani', telepon: '08123456702', nomorMeja: 'Takeaway', tipeLayanan: 'takeaway', loket: 'Barista 2', status: 'selesai', estimasiMenit: 3, ringkasanPesanan: '1x Iced Americano, 1x Kaya Butter Toast', catatan: 'Extra ice', waktuAmbil: minutesAgoIso(18), waktuPanggil: minutesAgoIso(15), waktuSiap: minutesAgoIso(11), waktuSelesai: minutesAgoIso(10), createdAt: minutesAgoIso(18) },
            { id: 'ant_3', tenantId: 'tnt_demo', transaksiId: 'trx_demo3', nomorAntrian: 'A-002', kodePrefix: 'A', urutan: 2, tanggal: today, namaPelanggan: 'Rizky Pratama', telepon: '08123456703', nomorMeja: 'Meja 05', tipeLayanan: 'dine-in', loket: 'Barista 1', status: 'siap', estimasiMenit: 5, ringkasanPesanan: '1x Caramel Macchiato, 1x Truffle French Fries', catatan: 'Sajikan hangat', waktuAmbil: minutesAgoIso(12), waktuPanggil: minutesAgoIso(9), waktuSiap: minutesAgoIso(2), waktuSelesai: null, createdAt: minutesAgoIso(12) },
            { id: 'ant_4', tenantId: 'tnt_demo', transaksiId: 'trx_demo4', nomorAntrian: 'A-003', kodePrefix: 'A', urutan: 3, tanggal: today, namaPelanggan: 'Nadia Putri', telepon: '08123456704', nomorMeja: 'Meja 01', tipeLayanan: 'dine-in', loket: 'Barista 1', status: 'dipanggil', estimasiMenit: 4, ringkasanPesanan: '1x Hot Caffe Latte, 1x Iced Matcha Latte', catatan: 'Oat milk', waktuAmbil: minutesAgoIso(8), waktuPanggil: minutesAgoIso(1), waktuSiap: null, waktuSelesai: null, createdAt: minutesAgoIso(8) },
            { id: 'ant_5', tenantId: 'tnt_demo', transaksiId: null, nomorAntrian: 'B-002', kodePrefix: 'B', urutan: 2, tanggal: today, namaPelanggan: 'Fajar Nugroho', telepon: '08123456705', nomorMeja: 'Takeaway', tipeLayanan: 'takeaway', loket: 'Barista 2', status: 'diproses', estimasiMenit: 6, ringkasanPesanan: '1x Manual Brew V60 Arabica', catatan: 'Beans Gayo Wine', waktuAmbil: minutesAgoIso(6), waktuPanggil: minutesAgoIso(3), waktuSiap: null, waktuSelesai: null, createdAt: minutesAgoIso(6) },
            { id: 'ant_6', tenantId: 'tnt_demo', transaksiId: 'trx_demo5', nomorAntrian: 'A-004', kodePrefix: 'A', urutan: 4, tanggal: today, namaPelanggan: 'Ayu Lestari', telepon: '08123456706', nomorMeja: 'Meja 08', tipeLayanan: 'dine-in', loket: 'Barista 1', status: 'menunggu', estimasiMenit: 5, ringkasanPesanan: '2x Es Kopi Susu Gula Aren, 1x Belgian Dark Chocolate', catatan: 'Normal ice', waktuAmbil: minutesAgoIso(3), waktuPanggil: null, waktuSiap: null, waktuSelesai: null, createdAt: minutesAgoIso(3) },
            { id: 'ant_7', tenantId: 'tnt_demo', transaksiId: null, nomorAntrian: 'B-003', kodePrefix: 'B', urutan: 3, tanggal: today, namaPelanggan: 'Bagus Setiawan', telepon: '08123456707', nomorMeja: 'Takeaway', tipeLayanan: 'takeaway', loket: 'Barista 2', status: 'menunggu', estimasiMenit: 4, ringkasanPesanan: '1x Iced Matcha Latte, 1x Butter Croissant', catatan: 'Pisahkan es', waktuAmbil: minutesAgoIso(1), waktuPanggil: null, waktuSiap: null, waktuSelesai: null, createdAt: minutesAgoIso(1) },
        ],
        payment: [
            { id: 'pay_1', tenantId: 'tnt_demo', transaksiId: 'trx_demo1', metode: 'qris', referensi: 'QRIS-CF001', qrString: 'DEMO-QRIS|ref=QRIS-CF001|amount=73000', jumlah: 73000, status: 'lunas', createdAt: minutesAgoIso(25), paidAt: minutesAgoIso(24) },
            { id: 'pay_2', tenantId: 'tnt_demo', transaksiId: 'trx_demo3', metode: 'qris', referensi: 'QRIS-CF003', qrString: 'DEMO-QRIS|ref=QRIS-CF003|amount=59000', jumlah: 59000, status: 'pending', createdAt: minutesAgoIso(12), paidAt: null },
        ],
        akun: [
            { id: 'akn_kas', tenantId: 'tnt_demo', kode: '1101', nama: 'Kas Kasir Caffe', tipe: 'aset', saldoNormal: 'debit', saldoAwal: 7500000, aktif: 1, createdAt: now },
            { id: 'akn_bank', tenantId: 'tnt_demo', kode: '1102', nama: 'Rekening Bank Caffe', tipe: 'aset', saldoNormal: 'debit', saldoAwal: 15000000, aktif: 1, createdAt: now },
            { id: 'akn_piutang', tenantId: 'tnt_demo', kode: '1103', nama: 'Piutang Settlement QRIS', tipe: 'aset', saldoNormal: 'debit', saldoAwal: 0, aktif: 1, createdAt: now },
            { id: 'akn_persed', tenantId: 'tnt_demo', kode: '1104', nama: 'Persediaan Bahan Kopi & Susu', tipe: 'aset', saldoNormal: 'debit', saldoAwal: 4500000, aktif: 1, createdAt: now },
            { id: 'akn_utang', tenantId: 'tnt_demo', kode: '2101', nama: 'Utang Supplier Roastery', tipe: 'kewajiban', saldoNormal: 'kredit', saldoAwal: 0, aktif: 1, createdAt: now },
            { id: 'akn_modal', tenantId: 'tnt_demo', kode: '3101', nama: 'Modal Pemilik Caffe', tipe: 'ekuitas', saldoNormal: 'kredit', saldoAwal: 27000000, aktif: 1, createdAt: now },
            { id: 'akn_prive', tenantId: 'tnt_demo', kode: '3102', nama: 'Prive Pemilik', tipe: 'ekuitas', saldoNormal: 'debit', saldoAwal: 0, aktif: 1, createdAt: now },
            { id: 'akn_jual', tenantId: 'tnt_demo', kode: '4101', nama: 'Pendapatan Penjualan Caffe', tipe: 'pendapatan', saldoNormal: 'kredit', saldoAwal: 0, aktif: 1, createdAt: now },
            { id: 'akn_hpp', tenantId: 'tnt_demo', kode: '5101', nama: 'Harga Pokok Penjualan (HPP)', tipe: 'beban', saldoNormal: 'debit', saldoAwal: 0, aktif: 1, createdAt: now },
            { id: 'akn_beban_op', tenantId: 'tnt_demo', kode: '6101', nama: 'Beban Operasional Barista & Listrik', tipe: 'beban', saldoNormal: 'debit', saldoAwal: 0, aktif: 1, createdAt: now },
        ],
        jurnal: [
            { id: 'jrn_1', tenantId: 'tnt_demo', nomor: 'JU-CF001', tanggal: today, sumber: 'transaksi', referensiId: 'trx_demo1', keterangan: 'Posting otomatis — Transaksi Jual TR-CF001 (A-001)', status: 'posted', createdAt: minutesAgoIso(25) },
            { id: 'jrn_2', tenantId: 'tnt_demo', nomor: 'JU-CF002', tanggal: today, sumber: 'transaksi', referensiId: 'trx_demo2', keterangan: 'Posting otomatis — Transaksi Jual TR-CF002 (B-001)', status: 'posted', createdAt: minutesAgoIso(18) },
        ],
        jurnal_detail: [
            { id: 'jd_1', tenantId: 'tnt_demo', jurnalId: 'jrn_1', akunId: 'akn_kas', debit: 73000, kredit: 0, keterangan: 'Penjualan TR-CF001' },
            { id: 'jd_2', tenantId: 'tnt_demo', jurnalId: 'jrn_1', akunId: 'akn_jual', debit: 0, kredit: 73000, keterangan: 'Penjualan TR-CF001' },
            { id: 'jd_3', tenantId: 'tnt_demo', jurnalId: 'jrn_1', akunId: 'akn_hpp', debit: 31000, kredit: 0, keterangan: 'HPP TR-CF001' },
            { id: 'jd_4', tenantId: 'tnt_demo', jurnalId: 'jrn_1', akunId: 'akn_persed', debit: 0, kredit: 31000, keterangan: 'HPP TR-CF001' },
            { id: 'jd_5', tenantId: 'tnt_demo', jurnalId: 'jrn_2', akunId: 'akn_kas', debit: 45000, kredit: 0, keterangan: 'Penjualan TR-CF002' },
            { id: 'jd_6', tenantId: 'tnt_demo', jurnalId: 'jrn_2', akunId: 'akn_jual', debit: 0, kredit: 45000, keterangan: 'Penjualan TR-CF002' },
            { id: 'jd_7', tenantId: 'tnt_demo', jurnalId: 'jrn_2', akunId: 'akn_hpp', debit: 18000, kredit: 0, keterangan: 'HPP TR-CF002' },
            { id: 'jd_8', tenantId: 'tnt_demo', jurnalId: 'jrn_2', akunId: 'akn_persed', debit: 0, kredit: 18000, keterangan: 'HPP TR-CF002' },
        ],
    };
}

function getLocalStore() {
    try {
        const raw = localStorage.getItem(LOCAL_DB_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.tenants) && Array.isArray(parsed.antrian)) {
                // Pastikan tanggal antrian demo selalu hari ini agar layar monitor langsung hidup
                const today = new Date().toISOString().slice(0, 10);
                let changed = false;
                for (const a of parsed.antrian) {
                    if (a.id && a.id.startsWith('ant_') && a.tanggal !== today) {
                        a.tanggal = today;
                        changed = true;
                    }
                }
                if (changed) saveLocalStore(parsed);
                return parsed;
            }
        }
    } catch (e) {}
    const fresh = createInitialSeedDb();
    saveLocalStore(fresh);
    return fresh;
}

function saveLocalStore(store) {
    try { localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(store)); } catch (e) {}
}

// ============================================================
// Token sesi & HTTP helpers ke Worker API
// ============================================================
function authHeaders() {
    const t = (typeof auth !== 'undefined') ? auth.token() : null;
    return t ? { Authorization: `Bearer ${t}` } : {};
}

function handleUnauthorized() {
    if (typeof auth !== 'undefined') {
        try { localStorage.removeItem(auth.SESSION_KEY); } catch (e) {}
    }
    if (typeof web !== 'undefined' && typeof web.navigate === 'function') web.navigate('login');
}

function qs(params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
        if (v !== undefined && v !== null && v !== '') sp.set(k, v);
    }
    const s = sp.toString();
    return s ? `?${s}` : '';
}

async function apiGet(params) {
    if (isLocalMode()) return localApiGet(params);
    try {
        const res = await fetch(`${API_BASE}/api${qs(params)}`, { headers: authHeaders() });
        if (res.status === 401) { handleUnauthorized(); throw new Error('Sesi berakhir, silakan masuk kembali.'); }
        if (!res.ok) {
            if (params.table === 'antrian') return localApiGet(params);
            let msg = `GET /api gagal (${res.status})`;
            try { const j = await res.json(); if (j?.error) msg = j.error; } catch (e) {}
            throw new Error(msg);
        }
        return res.json();
    } catch (err) {
        return localApiGet(params);
    }
}

async function apiSend(method, params, body) {
    if (isLocalMode()) return localApiSend(method, params, body);
    try {
        const res = await fetch(`${API_BASE}/api${qs(params)}`, {
            method,
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (res.status === 401) { handleUnauthorized(); throw new Error('Sesi berakhir, silakan masuk kembali.'); }
        if (res.status === 404) return null;
        if (!res.ok) {
            if (params.table === 'antrian') return localApiSend(method, params, body);
            let msg = `${method} /api gagal (${res.status})`;
            try { const j = await res.json(); if (j?.error) msg = j.error; } catch (e) {}
            throw new Error(msg);
        }
        return res.json();
    } catch (err) {
        return localApiSend(method, params, body);
    }
}

async function apiPublicGet(params) {
    if (isLocalMode()) return localPublicGet(params);
    try {
        const res = await fetch(`${API_BASE}/public${qs(params)}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) return localPublicGet(params);
        return body;
    } catch (err) {
        return localPublicGet(params);
    }
}

async function apiPublicSend(method, params, body) {
    if (isLocalMode()) return localPublicSend(method, params, body);
    try {
        const res = await fetch(`${API_BASE}/public${qs(params)}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const resBody = await res.json().catch(() => null);
        if (!res.ok) return localPublicSend(method, params, body);
        return resBody;
    } catch (err) {
        return localPublicSend(method, params, body);
    }
}

// ============================================================
// Implementasi Local D1 Simulator (kompatibel 100% dgn worker.js)
// ============================================================
function localApiGet(params) {
    const store = getLocalStore();
    const table = params.table;
    const id = params.id;
    if (table === 'tenants') {
        if (id) return (store.tenants || []).find(t => t.id === id) || null;
        return [...(store.tenants || [])];
    }
    const tenantId = activeTenantId() || 'tnt_demo';
    const list = (store[table] || []).filter(r => r.tenantId === tenantId);
    if (id) return list.find(r => r.id === id) || null;
    return [...list];
}

function localApiSend(method, params, body = {}) {
    const store = getLocalStore();
    const table = params.table;
    const id = params.id;

    if (table === 'tenants') {
        if (method === 'POST' && !id) {
            const kodeToko = String(body.kodeToko || '').trim().toUpperCase();
            if (store.tenants.some(t => t.kodeToko === kodeToko)) throw new Error('Kode Caffe sudah dipakai.');
            const now = new Date().toISOString();
            const slug = kodeToko.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
            const tnt = {
                id: genLocalId('tnt'), kodeToko, nama: body.nama || body.namaToko,
                alamat: body.alamat || '', telepon: body.telepon || '', status: 'aktif',
                slug, deskripsi: '', tampilOnline: 1, createdAt: now,
            };
            store.tenants.push(tnt);
            store.users.push({
                id: genLocalId('usr'), tenantId: tnt.id, username: body.ownerUsername || body.username,
                passwordPlain: body.ownerPassword || body.password, name: body.ownerName, role: 'owner', createdAt: now,
            });
            store.lokasi.push({
                id: genLocalId('lok'), tenantId: tnt.id, nama: 'Counter Barista & Kasir Utama', tipe: 'toko', alamat: tnt.alamat, createdAt: now,
            });
            saveLocalStore(store);
            return tnt;
        }
        if (method === 'PATCH' && id) {
            const idx = store.tenants.findIndex(t => t.id === id);
            if (idx < 0) throw new Error('Tenant tidak ditemukan.');
            if ('tampilOnline' in body) body = { ...body, tampilOnline: body.tampilOnline ? 1 : 0 };
            store.tenants[idx] = { ...store.tenants[idx], ...body };
            saveLocalStore(store);
            return store.tenants[idx];
        }
    }

    const tenantId = activeTenantId() || 'tnt_demo';
    if (!store[table]) store[table] = [];

    if (method === 'POST' && !id) {
        const record = { id: genLocalId(table), tenantId, ...body, createdAt: body.createdAt || new Date().toISOString() };
        store[table].push(record);
        saveLocalStore(store);
        return record;
    }
    if (method === 'PATCH' && id) {
        const idx = store[table].findIndex(r => r.id === id && r.tenantId === tenantId);
        if (idx < 0) throw new Error('Data tidak ditemukan.');
        store[table][idx] = { ...store[table][idx], ...body };
        saveLocalStore(store);
        return store[table][idx];
    }
    if (method === 'DELETE' && id) {
        store[table] = store[table].filter(r => !(r.id === id && r.tenantId === tenantId));
        saveLocalStore(store);
        return { ok: true };
    }
    throw new Error('Operasi tidak didukung.');
}

function localPublicGet(params) {
    const store = getLocalStore();
    const view = params.view;

    if (view === 'captcha') {
        const a = 1 + Math.floor(Math.random() * 8);
        const b = 1 + Math.floor(Math.random() * 8);
        return { challenge: `${a} + ${b} = ?`, token: `local_cap_${a + b}` };
    }
    if (view === 'toko-list') {
        return store.tenants.filter(t => t.status === 'aktif' && t.tampilOnline && t.id !== 'system');
    }
    if (view === 'toko-detail') {
        const kunci = String(params.toko || '').trim().toLowerCase();
        const tenant = store.tenants.find(t =>
            t.id !== 'system' && (
                (t.slug && t.slug.toLowerCase() === kunci) ||
                t.id.toLowerCase() === kunci ||
                t.kodeToko.toLowerCase() === kunci
            )
        ) || store.tenants.find(t => t.id === 'tnt_demo');
        if (!tenant) throw new Error('Caffe tidak ditemukan.');
        const produk = (store.produk || [])
            .filter(p => p.tenantId === tenant.id && p.aktif)
            .map(p => {
                const stok = (store.lokasi_produk || [])
                    .filter(lp => lp.produkId === p.id && lp.tenantId === tenant.id)
                    .reduce((s, lp) => s + (Number(lp.stok) || 0), 0);
                return { ...p, stok };
            });
        return { tenant, produk };
    }
    if (view === 'antrian-status') {
        const kunci = String(params.toko || '').trim().toLowerCase();
        const tenant = (kunci && store.tenants.find(t =>
            t.id !== 'system' && (
                (t.slug && t.slug.toLowerCase() === kunci) ||
                t.id.toLowerCase() === kunci ||
                t.kodeToko.toLowerCase() === kunci
            )
        )) || store.tenants.find(t => t.id === (activeTenantId() || 'tnt_demo')) || store.tenants.find(t => t.id === 'tnt_demo');
        const today = new Date().toISOString().slice(0, 10);
        const antrian = (store.antrian || []).filter(a => a.tenantId === tenant.id && a.tanggal === today);
        return { tenant, tanggal: today, antrian };
    }
    throw new Error('Rute publik tidak dikenal.');
}

function localNextQueue(store, tenantId, tanggal, kodePrefix = 'A') {
    const prefix = ['A', 'B', 'C'].includes(String(kodePrefix).toUpperCase()) ? String(kodePrefix).toUpperCase() : 'A';
    const existing = (store.antrian || []).filter(a => a.tenantId === tenantId && a.tanggal === tanggal && a.kodePrefix === prefix);
    const maxUrutan = existing.reduce((m, a) => Math.max(m, Number(a.urutan) || 0), 0);
    const urutan = maxUrutan + 1;
    return { kodePrefix: prefix, urutan, nomorAntrian: `${prefix}-${String(urutan).padStart(3, '0')}` };
}

function localPublicSend(method, params, body = {}) {
    const store = getLocalStore();
    const view = params.view;

    if (view === 'login') {
        if (String(body.captchaToken || '').startsWith('local_cap_')) {
            const expected = Number(String(body.captchaToken).replace('local_cap_', ''));
            if (Number(body.captchaAnswer) !== expected) throw new Error('Jawaban captcha salah.');
        }
        const kodeToko = String(body.kodeToko || '').trim().toUpperCase();
        const username = String(body.username || '').trim();
        const password = String(body.password || '');

        let tenant = store.tenants.find(t => t.kodeToko.toUpperCase() === kodeToko);
        // Alias agar login dengan kode TOKO001 atau CAFFE01 selalu nyaman
        if (!tenant && (kodeToko === 'CAFFE01' || kodeToko === 'TOKO001')) {
            tenant = store.tenants.find(t => t.id === 'tnt_demo');
        }
        const user = tenant ? store.users.find(u => u.tenantId === tenant.id && u.username.toLowerCase() === username.toLowerCase()) : null;
        if (!tenant || !user || (user.passwordPlain && user.passwordPlain !== password)) {
            throw new Error('Kode Caffe/Toko, username, atau password salah. (Demo: CAFFE01 / owner / owner123)');
        }
        return {
            token: `local_token_${user.id}_${Date.now()}`,
            user: {
                tenantId: tenant.id, tenantNama: tenant.nama, tenantSlug: tenant.slug,
                userId: user.id, username: user.username, name: user.name, role: user.role,
            },
        };
    }

    if (view === 'register') {
        const kodeToko = String(body.kodeToko || '').trim().toUpperCase();
        if (store.tenants.some(t => t.kodeToko === kodeToko)) throw new Error('Kode Caffe sudah dipakai.');
        const now = new Date().toISOString();
        const slug = kodeToko.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        const tenant = {
            id: genLocalId('tnt'), kodeToko, nama: body.namaToko, alamat: body.alamat || '',
            telepon: body.telepon || '', status: 'aktif', slug, deskripsi: 'Caffe baru terdaftar.', tampilOnline: 1, createdAt: now,
        };
        const user = {
            id: genLocalId('usr'), tenantId: tenant.id, username: body.username,
            passwordPlain: body.password, name: body.ownerName, role: 'owner', createdAt: now,
        };
        store.tenants.push(tenant);
        store.users.push(user);
        store.lokasi.push({ id: genLocalId('lok'), tenantId: tenant.id, nama: 'Counter Barista & Kasir Utama', tipe: 'toko', alamat: tenant.alamat, createdAt: now });
        saveLocalStore(store);
        return {
            token: `local_token_${user.id}_${Date.now()}`,
            user: {
                tenantId: tenant.id, tenantNama: tenant.nama, tenantSlug: tenant.slug,
                userId: user.id, username: user.username, name: user.name, role: user.role,
            },
        };
    }

    if (view === 'antrian-ambil') {
        const kunci = String(body.toko || '').trim().toLowerCase();
        const tenant = (kunci && store.tenants.find(t =>
            t.id !== 'system' && ((t.slug && t.slug.toLowerCase() === kunci) || t.id.toLowerCase() === kunci || t.kodeToko.toLowerCase() === kunci)
        )) || store.tenants.find(t => t.id === (activeTenantId() || 'tnt_demo')) || store.tenants.find(t => t.id === 'tnt_demo');
        if (!tenant) throw new Error('Caffe tidak ditemukan.');

        const now = new Date().toISOString();
        const today = now.slice(0, 10);
        const tipeLayanan = body.tipeLayanan || 'dine-in';
        const prefix = tipeLayanan === 'dine-in' ? 'A' : 'B';
        const { kodePrefix, urutan, nomorAntrian } = localNextQueue(store, tenant.id, today, prefix);

        const activeCount = (store.antrian || []).filter(a => a.tenantId === tenant.id && a.tanggal === today && ['menunggu', 'dipanggil', 'diproses'].includes(a.status)).length;
        const estimasiMenit = Math.max(4, (activeCount + 1) * 4);

        const rec = {
            id: genLocalId('antrian'),
            tenantId: tenant.id,
            transaksiId: null,
            nomorAntrian,
            kodePrefix,
            urutan,
            tanggal: today,
            namaPelanggan: String(body.namaPelanggan || 'Pelanggan').trim(),
            telepon: String(body.telepon || '').trim(),
            nomorMeja: String(body.nomorMeja || (tipeLayanan === 'dine-in' ? 'Meja Umum' : 'Takeaway')).trim(),
            tipeLayanan,
            loket: prefix === 'A' ? 'Barista 1' : 'Barista 2',
            status: 'menunggu',
            estimasiMenit,
            ringkasanPesanan: String(body.ringkasanPesanan || 'Ambil Antrian Walk-In / Pesan di Kasir').trim(),
            catatan: String(body.catatan || '').trim(),
            waktuAmbil: now,
            waktuPanggil: null,
            waktuSiap: null,
            waktuSelesai: null,
            createdAt: now,
        };
        store.antrian.push(rec);
        saveLocalStore(store);
        invalidateTable('antrian', tenant.id);
        return rec;
    }

    if (view === 'toko-pesan') {
        const kunci = String(body.toko || '').trim().toLowerCase();
        const tenant = store.tenants.find(t =>
            t.id !== 'system' && ((t.slug && t.slug.toLowerCase() === kunci) || t.id.toLowerCase() === kunci || t.kodeToko.toLowerCase() === kunci)
        ) || store.tenants.find(t => t.id === 'tnt_demo');
        if (!tenant) throw new Error('Caffe tidak ditemukan.');

        const produkById = Object.fromEntries((store.produk || []).filter(p => p.tenantId === tenant.id).map(p => [p.id, p]));
        const now = new Date().toISOString();
        const today = now.slice(0, 10);
        const tipeLayanan = body.pembeli?.tipeLayanan || 'dine-in';
        const nomorMeja = body.pembeli?.nomorMeja || (tipeLayanan === 'dine-in' ? 'Meja 01' : 'Takeaway');
        const prefix = tipeLayanan === 'dine-in' ? 'A' : 'B';
        const { kodePrefix, urutan, nomorAntrian } = localNextQueue(store, tenant.id, today, prefix);

        let total = 0;
        let totalEst = 0;
        const ringkasanParts = [];
        const lines = [];
        for (const it of (body.items || [])) {
            const p = produkById[it.produkId];
            if (!p || !it.qty) continue;
            const sub = it.qty * (p.hargaJual || 0);
            total += sub;
            totalEst += (p.estimasiMenit || 4) * Math.ceil(it.qty / 2);
            ringkasanParts.push(`${it.qty}x ${p.nama}`);
            lines.push({ produkId: p.id, qty: it.qty, hargaSatuan: p.hargaJual || 0, subtotal: sub });
        }

        const lokasi = (store.lokasi || []).find(l => l.tenantId === tenant.id) || { id: 'lok_toko' };
        const trx = {
            id: genLocalId('trx'),
            tenantId: tenant.id,
            nomor: 'ON-' + Date.now().toString(36).toUpperCase(),
            tipe: 'jual',
            tanggal: today,
            lokasiId: lokasi.id,
            kontakId: null,
            status: 'draft',
            metodePembayaran: 'qris',
            totalBayar: total,
            catatan: `Pesanan Online (${nomorAntrian}) — ${body.pembeli?.alamat || ''}`,
            sumber: 'online',
            pembeliNama: body.pembeli?.nama || 'Pelanggan Online',
            pembeliTelepon: body.pembeli?.telepon || '-',
            pembeliAlamat: body.pembeli?.alamat || '',
            nomorMeja,
            tipeLayanan,
            nomorAntrian,
            createdAt: now,
        };
        store.transaksi.push(trx);
        for (const l of lines) {
            store.transaksi_produk.push({ id: genLocalId('tp'), tenantId: tenant.id, transaksiId: trx.id, ...l });
        }

        const antrianRec = {
            id: genLocalId('ant'),
            tenantId: tenant.id,
            transaksiId: trx.id,
            nomorAntrian,
            kodePrefix,
            urutan,
            tanggal: today,
            namaPelanggan: trx.pembeliNama,
            telepon: trx.pembeliTelepon,
            nomorMeja,
            tipeLayanan,
            loket: prefix === 'A' ? 'Barista 1' : 'Barista 2',
            status: 'menunggu',
            estimasiMenit: Math.max(4, Math.min(30, totalEst || 5)),
            ringkasanPesanan: ringkasanParts.join(', '),
            catatan: body.pembeli?.alamat || '',
            waktuAmbil: now,
            waktuPanggil: null,
            waktuSiap: null,
            waktuSelesai: null,
            createdAt: now,
        };
        store.antrian.push(antrianRec);
        saveLocalStore(store);
        invalidateTable('transaksi', tenant.id);
        invalidateTable('antrian', tenant.id);
        return { id: trx.id, nomor: trx.nomor, total, nomorAntrian, antrianId: antrianRec.id, estimasiMenit: antrianRec.estimasiMenit };
    }

    throw new Error('Operasi publik tidak dikenal.');
}

// ============================================================
// Cache in-memory per tabel
// ============================================================
const _tableCache = new Map();
const CACHE_TTL_MS = 30_000;

function cacheKey(table, tenantId) {
    return tenantId ? `${table}:${tenantId}` : table;
}
function invalidateTable(table, tenantId) {
    if (tenantId !== undefined) { _tableCache.delete(cacheKey(table, tenantId)); return; }
    for (const key of _tableCache.keys()) {
        if (key === table || key.startsWith(`${table}:`)) _tableCache.delete(key);
    }
}

function activeTenantId() {
    const user = (typeof auth !== 'undefined') ? auth.currentUser() : null;
    return user?.tenantId || null;
}
function requireTenant() {
    const t = activeTenantId();
    if (!t) throw new Error('Tidak ada sesi tenant aktif — silakan masuk kembali.');
    return t;
}

const db = {
    isLocalMode,
    setLocalMode,
    resetDemoData() {
        const fresh = createInitialSeedDb();
        saveLocalStore(fresh);
        _tableCache.clear();
        return fresh;
    },

    async all(table) {
        const params = { table };
        if (SCOPED_TABLES.has(table)) params.tenantId = requireTenant();

        const key = cacheKey(table, params.tenantId);
        const hit = _tableCache.get(key);
        if (hit && (Date.now() - hit.ts) < CACHE_TTL_MS) return hit.data;

        const data = await apiGet({ table });
        _tableCache.set(key, { data, ts: Date.now() });
        return data;
    },

    async find(table, predicate) {
        const rows = await this.all(table);
        return rows.find(predicate) || null;
    },

    async query(table, predicate) {
        const rows = await this.all(table);
        return rows.filter(predicate);
    },

    async insert(table, row) {
        const tenantId = SCOPED_TABLES.has(table) ? requireTenant() : undefined;
        const result = await apiSend('POST', { table }, row);
        invalidateTable(table, tenantId);
        return result;
    },

    async update(table, id, patch) {
        const tenantId = SCOPED_TABLES.has(table) ? requireTenant() : undefined;
        const result = await apiSend('PATCH', { table, id }, patch);
        invalidateTable(table, tenantId);
        return result;
    },

    async remove(table, id) {
        const tenantId = SCOPED_TABLES.has(table) ? requireTenant() : undefined;
        await apiSend('DELETE', { table, id });
        invalidateTable(table, tenantId);
        return true;
    },

    async upsertBy(table, matchFn, row) {
        const rows = await this.all(table);
        const existing = rows.find(matchFn);
        if (!existing) return this.insert(table, row);
        return this.update(table, existing.id, row);
    },

    /** Buat nomor antrian baru untuk hari ini dari Kasir / halaman Antrian. */
    async buatAntrianBaru(payload = {}) {
        const today = new Date().toISOString().slice(0, 10);
        const now = new Date().toISOString();
        const tipeLayanan = payload.tipeLayanan || 'dine-in';
        const kodePrefix = payload.kodePrefix || (tipeLayanan === 'dine-in' ? 'A' : 'B');
        const rowsToday = await this.query('antrian', a => a.tanggal === today && a.kodePrefix === kodePrefix);
        const maxUrutan = rowsToday.reduce((m, a) => Math.max(m, Number(a.urutan) || 0), 0);
        const urutan = maxUrutan + 1;
        const nomorAntrian = `${kodePrefix}-${String(urutan).padStart(3, '0')}`;

        const activeRows = await this.query('antrian', a => a.tanggal === today && ['menunggu', 'dipanggil', 'diproses'].includes(a.status));
        const estimasiMenit = payload.estimasiMenit || Math.max(4, (activeRows.length + 1) * 4);

        return this.insert('antrian', {
            transaksiId: payload.transaksiId || null,
            nomorAntrian,
            kodePrefix,
            urutan,
            tanggal: today,
            namaPelanggan: payload.namaPelanggan || 'Pelanggan Caffe',
            telepon: payload.telepon || '',
            nomorMeja: payload.nomorMeja || (tipeLayanan === 'dine-in' ? 'Meja 01' : 'Takeaway'),
            tipeLayanan,
            loket: payload.loket || (kodePrefix === 'A' ? 'Barista 1' : 'Barista 2'),
            status: payload.status || 'menunggu',
            estimasiMenit,
            ringkasanPesanan: payload.ringkasanPesanan || '-',
            catatan: payload.catatan || '',
            waktuAmbil: now,
            waktuPanggil: null,
            waktuSiap: null,
            waktuSelesai: null,
            createdAt: now,
        });
    },

    // --- Tabel `tenants` ---
    async allTenants() {
        const key = cacheKey('tenants');
        const hit = _tableCache.get(key);
        if (hit && (Date.now() - hit.ts) < CACHE_TTL_MS) return hit.data;
        const data = await apiGet({ table: 'tenants' });
        _tableCache.set(key, { data, ts: Date.now() });
        return data;
    },
    async insertTenant(payload) {
        const result = await apiSend('POST', { table: 'tenants' }, payload);
        invalidateTable('tenants');
        return result;
    },
    async updateTenant(id, patch) {
        const result = await apiSend('PATCH', { table: 'tenants', id }, patch);
        invalidateTable('tenants');
        return result;
    },

    async myTenant() {
        return apiGet({ table: 'tenants', id: requireTenant() });
    },
    async updateMyTenant(patch) {
        const result = await apiSend('PATCH', { table: 'tenants', id: requireTenant() }, patch);
        invalidateTable('tenants');
        return result;
    },

    // --- Autentikasi ---
    async login(payload) { return apiPublicSend('POST', { view: 'login' }, payload); },
    async register(payload) { return apiPublicSend('POST', { view: 'register' }, payload); },
    async getCaptcha() { return apiPublicGet({ view: 'captcha' }); },

    // --- Etalase Menu Caffe & Layar Antrian Publik ---
    async storefrontTokoList() { return apiPublicGet({ view: 'toko-list' }); },
    async storefrontTokoDetail(toko) { return apiPublicGet({ view: 'toko-detail', toko }); },
    async storefrontPesan({ tenantId, pembeli, items }) {
        return apiPublicSend('POST', { view: 'toko-pesan' }, { toko: tenantId, pembeli, items });
    },
    async publicAntrianStatus(toko) {
        return apiPublicGet({ view: 'antrian-status', toko: toko || '' });
    },
    async publicAntrianAmbil(payload) {
        return apiPublicSend('POST', { view: 'antrian-ambil' }, payload);
    },
};
