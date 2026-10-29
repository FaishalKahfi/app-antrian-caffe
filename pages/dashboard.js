// ============================================================
// pages/dashboard.js — Ringkasan KPI Antrian Caffe + Penjualan + Menu Terlaris.
// ============================================================
web.routes.dashboard = 'resolveDashboard';

async function resolveDashboard() {
    const guard = requireLogin(['owner', 'kasir', 'gudang', 'superadmin']);
    if (guard) return guard;

    const user = auth.currentUser();
    if (user.role === 'superadmin') return resolveTenant();

    const today = new Date().toISOString().slice(0, 10);
    const [transaksiList, produkList, lokasiList, stokList, antrianList] = await Promise.all([
        db.query('transaksi', () => true),
        db.query('produk', () => true),
        db.query('lokasi', () => true),
        db.query('lokasi_produk', () => true),
        db.query('antrian', () => true),
    ]);

    const penjualanSelesai = transaksiList.filter(t => t.tipe === 'jual' && t.status === 'selesai');
    const totalPenjualan = penjualanSelesai.reduce((sum, t) => sum + (t.totalBayar || 0), 0);
    const transaksiDraft = transaksiList.filter(t => t.status === 'draft').length;
    const stokMenipis = stokList.filter(s => s.stok <= (s.stokMinimum || 0)).length;

    const antrianHariIni = antrianList.filter(a => a.tanggal === today);
    const antrianMenunggu = antrianHariIni.filter(a => a.status === 'menunggu').length;
    const antrianProses = antrianHariIni.filter(a => ['dipanggil', 'diproses', 'siap'].includes(a.status)).length;
    const antrianSelesai = antrianHariIni.filter(a => a.status === 'selesai').length;

    // Menu terlaris
    const qtyPerProduk = {};
    for (const t of penjualanSelesai) {
        const baris = await db.query('transaksi_produk', b => b.transaksiId === t.id);
        for (const b of baris) qtyPerProduk[b.produkId] = (qtyPerProduk[b.produkId] || 0) + b.qty;
    }
    const produkById = Object.fromEntries(produkList.map(p => [p.id, p]));
    const terlaris = Object.entries(qtyPerProduk)
        .map(([produkId, qty]) => ({ label: produkById[produkId]?.nama || produkId, value: qty }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

    const statLaba = [];
    if (user.role === 'owner' && typeof laporanPage !== 'undefined') {
        const saldoList = await laporanPage.hitungSaldoAkun();
        const pendapatan = saldoList.filter(s => s.akun.tipe === 'pendapatan').reduce((s, r) => s + r.saldoAkhir, 0);
        const beban = saldoList.filter(s => s.akun.tipe === 'beban').reduce((s, r) => s + r.saldoAkhir, 0);
        statLaba.push({ value: formatRupiah(pendapatan - beban), label: (pendapatan - beban) >= 0 ? 'Laba Bersih' : 'Rugi Bersih' });
    }

    return [
        { section: 'titleHero', title: 'Dashboard Caffe & Antrian', description: `Selamat datang kembali, <strong>${escHtml(user.name)}</strong> &mdash; ${escHtml(user.tenantNama)}.` },
        {
            section: 'statGrid',
            stats: [
                { value: antrianMenunggu, label: 'Antrian Menunggu' },
                { value: antrianProses, label: 'Sedang Diproses / Siap' },
                { value: antrianSelesai, label: 'Antrian Selesai Hari Ini' },
                { value: formatRupiah(totalPenjualan), label: 'Total Penjualan (Selesai)' },
                { value: penjualanSelesai.length, label: 'Pesanan Jual Selesai' },
                { value: transaksiDraft, label: 'Pesanan Online Menunggu' },
                { value: produkList.length, label: 'Total Menu Caffe' },
                ...statLaba,
            ],
        },
        { section: 'barChart', title: 'Menu Caffe Terlaris (Jumlah Cup / Porsi Terjual)', items: terlaris },
        {
            section: 'article',
            leftCol: {
                subtitle: 'Aksi Cepat Caffe',
                lines: [
                    'link:Panel Panggilan Antrian & Barista:antrian',
                    '---',
                    'link:Layar Monitor TV Antrian:layar-antrian',
                    '---',
                    'link:Simulasi Antrian Caffe (M/M/c):simulasi',
                    '---',
                    'link:Kasir + Buat Antrian Baru:kasir',
                    '---',
                    'link:Kelola Menu & Produk Caffe:produk',
                    ...(user.role === 'owner' ? ['---', 'link:Laporan Keuangan Caffe:laporan'] : []),
                ],
            },
            rightCol: {
                subtitle: 'Status Operasional Caffe',
                lines: [
                    `card:Antrian Aktif Saat Ini:${antrianMenunggu} menunggu, ${antrianProses} sedang diracik/siap disajikan`,
                    stokMenipis
                        ? `card:Peringatan Stok Bahan Baku:${stokMenipis} item stok di bawah batas minimum`
                        : `card:Stok Bahan Baku & Menu:Seluruh stok bahan baku caffe aman terkendali 👍`,
                    'link:Kelola Stok & Lokasi Counter:lokasi',
                ],
            },
        },
    ];
}
