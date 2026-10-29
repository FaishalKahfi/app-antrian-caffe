// ============================================================
// pages/transaksi.js — Transaksi jual (pesanan pelanggan caffe + nomor antrian)
// & beli (pembelian bahan baku dari supplier roastery), lewat mesin bersama
// createInstantDocumentPage (pages/shared.js).
// ============================================================
web.routes.transaksi = 'resolveTransaksi';

const transaksiKasirPage = createInstantDocumentPage('transaksiKasirPage', {
    headerTable: 'transaksi', lineTable: 'transaksi_produk', headerIdField: 'transaksiId',
    nomorPrefix: () => 'TR-',
    detailRoute: () => 'transaksi/detail-',
    pageTitle: (tipe) => tipe === 'jual' ? 'Pesanan Jual Caffe' : 'Pembelian Bahan Baku',
    pageDesc: (tipe) => tipe === 'jual'
        ? 'Pilih counter & pelanggan di atas, ketuk menu untuk menambah ke keranjang, lalu ketuk keranjang di kanan-bawah untuk membuat transaksi & nomor antrian.'
        : 'Pilih lokasi & supplier roastery di atas, ketuk bahan baku untuk menambah ke keranjang, lalu selesaikan pembelian.',
    lokasiLabel: () => 'Lokasi / Counter',
    kontakLabel: (tipe) => tipe === 'jual' ? 'Pelanggan / Member' : 'Supplier Roastery',
    kontakEmptyLabel: (tipe) => tipe === 'jual' ? 'umum / walk-in' : 'tanpa supplier',
    kontakFilter: (k, tipe) => tipe === 'jual' ? k.tipe === 'customer' : (k.tipe === 'supplier' || k.tipe === 'distributor'),
    getPrice: (p, tipe) => tipe === 'jual' ? (p.hargaJual || 0) : (p.hargaBeli || 0),
    allowPriceEdit: true,
    cartTitle: 'Keranjang Transaksi',
    emptyCatalogMsg: 'Belum ada menu/produk aktif.',
    emptyCartMsg: 'Keranjang masih kosong. Ketuk produk di katalog untuk menambah.',
    extraFieldsHtml: (tipe) => tipe === 'jual' ? `
        <div class="a-row"><label class="a-label">Nama Panggilan Pelanggan</label>
            <input type="text" name="pembeliNama" placeholder="mis. Kak Andi" maxlength="80"></div>
        <div class="a-row"><label class="a-label">Tipe Layanan</label>
            <select name="tipeLayanan">
                <option value="dine-in">Dine-In (Antrian A)</option>
                <option value="takeaway">Takeaway (Antrian B)</option>
            </select></div>
        <div class="a-row"><label class="a-label">Nomor Meja</label>
            <input type="text" name="nomorMeja" value="Meja 01" maxlength="30"></div>
        <div class="a-row"><label class="a-label">Bayar dengan</label>
            <select name="metodePembayaran">
                <option value="tunai">Tunai</option>
                <option value="qris">QRIS</option>
            </select></div>` : `
        <div class="a-row"><label class="a-label">Bayar dengan</label>
            <select name="metodePembayaran">
                <option value="tunai">Tunai</option>
                <option value="qris">Non-Tunai / Transfer</option>
            </select></div>`,
    readExtra: (form) => ({
        pembeliNama: form.querySelector('[name="pembeliNama"]')?.value?.trim() || '',
        tipeLayanan: form.querySelector('[name="tipeLayanan"]')?.value || 'dine-in',
        nomorMeja: form.querySelector('[name="nomorMeja"]')?.value?.trim() || 'Meja 01',
        metodePembayaran: form.querySelector('[name="metodePembayaran"]')?.value || 'tunai',
    }),
    headerExtra: (ctrl, extra, tipe) => ({
        metodePembayaran: extra.metodePembayaran,
        totalBayar: ctrl.total(),
        ...(tipe === 'jual' ? {
            pembeliNama: extra.pembeliNama || 'Pelanggan Caffe',
            tipeLayanan: extra.tipeLayanan,
            nomorMeja: extra.nomorMeja,
        } : {}),
    }),
    lineExtra: (c) => ({ subtotal: c.qty * c.harga }),
    confirmLabel: (ctrl) => `Selesaikan (${formatRupiah(ctrl.total())})`,
    stockDelta: (tipe) => tipe === 'jual' ? -1 : 1,
    afterConfirm: async (header, cart, tipe, ctrl) => {
        if (header.metodePembayaran === 'qris') await qrisPage.buatPembayaran(header.id, header.totalBayar);
        await jurnalPage.postingTransaksi(header, cart, ctrl);

        if (tipe === 'jual') {
            const ringkasan = cart.map(c => `${c.qty}x ${c.nama}`).join(', ');
            const ant = await db.buatAntrianBaru({
                transaksiId: header.id,
                namaPelanggan: header.pembeliNama || 'Pelanggan Caffe',
                tipeLayanan: header.tipeLayanan || 'dine-in',
                kodePrefix: (header.tipeLayanan || 'dine-in') === 'dine-in' ? 'A' : 'B',
                nomorMeja: header.nomorMeja || 'Meja 01',
                ringkasanPesanan: ringkasan,
            });
            await db.update('transaksi', header.id, { nomorAntrian: ant.nomorAntrian });
        }
    },
});

const transaksiPage = {
    async hapus(id) {
        if (!confirm('Hapus transaksi ini? Stok TIDAK dikembalikan otomatis — sesuaikan manual lewat Distribusi bila perlu.')) return;
        try { await db.remove('transaksi', id); } catch (err) { return alert('Gagal menghapus: ' + err.message); }
        web.navigate('transaksi');
    },

    async konfirmasiPesanan(id) {
        const trx = await db.find('transaksi', t => t.id === id);
        if (!trx) return alert('Transaksi tidak ditemukan.');
        if (!confirm(`Konfirmasi pesanan online ${trx.nomor}? Stok akan dipotong, jurnal diposting, dan antrian diteruskan ke Barista.`)) return;
        try {
            const [baris, produkList] = await Promise.all([
                db.query('transaksi_produk', b => b.transaksiId === trx.id),
                db.query('produk', () => true),
            ]);
            for (const b of baris) {
                const existing = await db.find('lokasi_produk', s => s.lokasiId === trx.lokasiId && s.produkId === b.produkId);
                const stokBaru = (existing?.stok || 0) - b.qty;
                if (existing) await db.update('lokasi_produk', existing.id, { stok: stokBaru });
                else await db.insert('lokasi_produk', { lokasiId: trx.lokasiId, produkId: b.produkId, stok: stokBaru, stokMinimum: 0 });
            }
            await db.update('transaksi', trx.id, { status: 'selesai' });
            const cart = baris.map(b => ({ produkId: b.produkId, qty: b.qty, harga: b.hargaSatuan }));
            await jurnalPage.postingTransaksi({ ...trx, status: 'selesai' }, cart, { produkList });

            // Jika belum ada tiket antrian terkait transaksi ini, buat otomatis
            const existingAntrian = await db.find('antrian', a => a.transaksiId === trx.id);
            if (!existingAntrian) {
                const produkById = Object.fromEntries(produkList.map(p => [p.id, p]));
                const ringkasan = baris.map(b => `${b.qty}x ${produkById[b.produkId]?.nama || 'Menu'}`).join(', ');
                const ant = await db.buatAntrianBaru({
                    transaksiId: trx.id,
                    namaPelanggan: trx.pembeliNama || 'Pelanggan Online',
                    telepon: trx.pembeliTelepon || '',
                    nomorMeja: trx.nomorMeja || 'Takeaway',
                    tipeLayanan: trx.tipeLayanan || 'takeaway',
                    ringkasanPesanan: ringkasan,
                    catatan: trx.pembeliAlamat || '',
                });
                await db.update('transaksi', trx.id, { nomorAntrian: ant.nomorAntrian });
            }
        } catch (err) { return alert('Gagal mengonfirmasi pesanan: ' + err.message); }
        web.navigate(`transaksi/detail-${trx.id}`);
    },

    async tolakPesanan(id) {
        const trx = await db.find('transaksi', t => t.id === id);
        if (!trx) return alert('Transaksi tidak ditemukan.');
        if (!confirm(`Tolak pesanan online ${trx.nomor}? Pesanan & antriannya akan ditandai batal.`)) return;
        try {
            await db.update('transaksi', trx.id, { status: 'batal' });
            const existingAntrian = await db.find('antrian', a => a.transaksiId === trx.id);
            if (existingAntrian) await db.update('antrian', existingAntrian.id, { status: 'batal' });
        } catch (err) { return alert('Gagal menolak pesanan: ' + err.message); }
        web.navigate(`transaksi/detail-${trx.id}`);
    },
};

// --- Pembayaran QRIS ---------------------------------------------------
const qrisPage = {
    async buatPembayaran(transaksiId, jumlah) {
        const referensi = 'QRIS-' + Date.now().toString(36).toUpperCase();
        await db.insert('payment', {
            transaksiId, metode: 'qris', referensi,
            qrString: `DEMO-QRIS|ref=${referensi}|amount=${jumlah}`,
            jumlah, status: 'pending', createdAt: new Date().toISOString(), paidAt: null,
        });
    },

    async tandaiLunas(paymentId, transaksiId) {
        if (!confirm('Tandai pembayaran QRIS ini sebagai LUNAS?')) return;
        try {
            const payment = await db.find('payment', p => p.id === paymentId);
            await db.update('payment', paymentId, { status: 'lunas', paidAt: new Date().toISOString() });
            if (payment) await jurnalPage.postingPelunasanQris(payment);
        } catch (err) { return alert('Gagal memperbarui status: ' + err.message); }
        web.navigate(`transaksi/detail-${transaksiId}`);
    },
};

async function resolveTransaksi(sub) {
    const guard = requireLogin(['owner', 'kasir']);
    if (guard) return guard;

    if (sub && sub.startsWith('detail-')) return resolveTransaksiDetail(sub.replace('detail-', ''));

    if (sub === 'jual' || sub === 'beli') {
        await transaksiKasirPage.load(sub);
        transaksiKasirPage.kataKunci = '';
        transaksiKasirPage.kategoriAktif = '';

        const judul = sub === 'jual' ? 'Pesanan Jual Caffe' : 'Pembelian Bahan Baku';
        if (!transaksiKasirPage.lokasiList.length) {
            return [
                { section: 'titleHero', title: judul, description: 'Transaksi jual/beli lewat layar kasir.' },
                { section: 'articleFull', subtitle: 'Belum Bisa Transaksi', lines: ['Buat minimal 1 lokasi di menu Lokasi sebelum membuat transaksi.'] },
            ];
        }
        if (!transaksiKasirPage.produkList.length) {
            return [
                { section: 'titleHero', title: judul, description: 'Transaksi jual/beli lewat layar kasir.' },
                { section: 'articleFull', subtitle: 'Belum Ada Produk', lines: ['Tambahkan produk aktif di menu Produk sebelum membuat transaksi.'] },
            ];
        }
        return transaksiKasirPage.pageBlocks(sub);
    }

    const [rows, lokasiList, kontakList, antrianList] = await Promise.all([
        db.query('transaksi', () => true),
        db.query('lokasi', () => true),
        db.query('kontak', () => true),
        db.query('antrian', () => true),
    ]);
    const lokasiById = Object.fromEntries(lokasiList.map(l => [l.id, l]));
    const kontakById = Object.fromEntries(kontakList.map(k => [k.id, k]));
    const antrianByTrxId = Object.fromEntries(antrianList.filter(a => a.transaksiId).map(a => [a.transaksiId, a]));

    const statusBadge = { draft: 'badge-muted', selesai: 'badge-success', batal: 'badge-warning' };
    const pesananMasuk = rows.filter(t => t.sumber === 'online' && t.status === 'draft').length;

    const tableRows = rows
        .sort((a, b) => (b.createdAt || b.tanggal || '').localeCompare(a.createdAt || a.tanggal || ''))
        .map(t => {
            const ant = antrianByTrxId[t.id];
            const noAntrian = t.nomorAntrian || ant?.nomorAntrian || '-';
            return {
                Nomor: t.nomor,
                Antrian: noAntrian !== '-' ? `<span class="badge">${escHtml(noAntrian)}</span>` : '-',
                Tipe: `<span class="badge ${t.tipe === 'jual' ? '' : 'badge-warning'}">${t.tipe === 'jual' ? 'Jual' : 'Beli'}</span>${t.sumber === 'online' ? ' <span class="badge badge-warning">Online</span>' : ''}`,
                Tanggal: t.tanggal,
                Pelanggan: t.pembeliNama || kontakById[t.kontakId]?.nama || '-',
                Meja: t.nomorMeja || lokasiById[t.lokasiId]?.nama || '-',
                Total: formatRupiah(t.totalBayar),
                Status: `<span class="badge ${escHtml(statusBadge[t.status] || '')}">${escHtml(t.status)}</span>`,
                Aksi: `<button class="slcBtn" onclick='web.navigate(${JSON.stringify('transaksi/detail-' + t.id)})'>Detail</button>`,
            };
        });

    return [
        { section: 'titleHero', title: 'Riwayat Transaksi & Pesanan Caffe', description: 'Daftar pesanan penjualan pelanggan caffe (POS & Online) serta pembelian bahan baku dari supplier.' },
        {
            section: 'articleFull',
            subtitle: `Daftar Transaksi (${rows.length})`,
            lines: [
                `<button class="slcBtn" onclick="web.navigate('transaksi/jual')">+ Pesanan Jual Caffe</button>
                 <button class="slcBtn" style="background:#555" onclick="web.navigate('transaksi/beli')">+ Pembelian Bahan Baku</button>
                 <button class="slcBtn" style="background:#1D9E75" onclick="web.navigate('antrian')">&#127908; Buka Panel Antrian</button>`,
                pesananMasuk > 0 ? `<div class="info-card"><strong>${pesananMasuk} pesanan menu online menunggu konfirmasi kasir.</strong><p>Buka detail transaksi berstatus "draft" bertanda Online di bawah untuk mengonfirmasi atau menolaknya.</p></div>` : '',
                `table:${JSON.stringify(tableRows)}`,
            ],
            tableOpts: { rawKeys: ['Antrian', 'Tipe', 'Status', 'Aksi'] },
            emptyText: 'Belum ada transaksi.',
        },
    ];
}

async function resolveTransaksiDetail(id) {
    const trx = await db.find('transaksi', t => t.id === id);
    if (!trx) return [{ section: 'titleHero', title: 'Transaksi Tidak Ditemukan' }];

    const [baris, lokasi, kontak, produkList, payments, antrian] = await Promise.all([
        db.query('transaksi_produk', b => b.transaksiId === id),
        db.find('lokasi', l => l.id === trx.lokasiId),
        trx.kontakId ? db.find('kontak', k => k.id === trx.kontakId) : Promise.resolve(null),
        db.query('produk', () => true),
        db.query('payment', p => p.transaksiId === id),
        db.find('antrian', a => a.transaksiId === id),
    ]);
    const produkById = Object.fromEntries(produkList.map(p => [p.id, p]));

    const tableRows = baris.map(b => ({
        Produk: produkById[b.produkId]?.nama || '(produk terhapus)',
        Jumlah: b.qty,
        'Harga Satuan': formatRupiah(b.hargaSatuan),
        Subtotal: formatRupiah(b.qty * b.hargaSatuan),
    }));

    const antrianBlock = (antrian || trx.nomorAntrian) ? [
        '## Tiket Antrian Caffe',
        `card:Nomor Antrian:${antrian?.nomorAntrian || trx.nomorAntrian}`,
        `card:Status Antrian:${(antrian?.status || 'menunggu').toUpperCase()} (${antrian?.loket || 'Barista 1'})`,
        `card:Layanan & Meja:${(antrian?.tipeLayanan || trx.tipeLayanan || 'dine-in').toUpperCase()} — ${antrian?.nomorMeja || trx.nomorMeja || '-'}`,
        antrian ? `<div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="slcBtn" onclick='antrianPage.bukaTiket(${JSON.stringify(antrian.id)})'>&#127915; Lihat / Cetak Tiket Antrian</button>
            <button type="button" class="slcBtn" style="background:#1D9E75" onclick='antrianPage.panggil(${JSON.stringify(antrian.id)})'>&#128266; Panggil Suara Pelanggan</button>
            <button type="button" class="slcBtn" style="background:#555" onclick="web.navigate('antrian')">Buka Panel Antrian</button>
        </div>` : '',
    ] : [];

    const pay = payments[0];
    const paymentBlock = pay ? [
        '## Pembayaran QRIS',
        `card:Status Pembayaran:${pay.status === 'lunas' ? 'LUNAS' : 'Menunggu Pembayaran'}`,
        `card:Jumlah:${formatRupiah(pay.jumlah)}`,
        `card:Referensi:${pay.referensi}`,
        pay.status === 'pending'
            ? `<div class="info-card"><strong>Kode QRIS (Demo)</strong><p style="word-break:break-all">${escHtml(pay.qrString)}</p>
               <button class="slcBtn" onclick='qrisPage.tandaiLunas(${JSON.stringify(pay.id)},${JSON.stringify(id)})'>Tandai Lunas (Simulasi)</button></div>`
            : '',
    ] : [];

    const isOnline = trx.sumber === 'online';
    const menungguKonfirmasi = isOnline && trx.status === 'draft';

    const pesananOnlineBlock = isOnline ? [
        '## Data Pemesan (Menu Online)',
        `card:Nama:${trx.pembeliNama || '-'}`,
        `card:Telepon/WA:${trx.pembeliTelepon || '-'}`,
        trx.nomorMeja ? `card:Meja / Layanan:${trx.nomorMeja} (${trx.tipeLayanan || 'dine-in'})` : '',
        trx.pembeliAlamat ? `card:Catatan Pesanan:${trx.pembeliAlamat}` : '',
        menungguKonfirmasi
            ? `<div class="info-card"><strong>Menunggu Konfirmasi Kasir</strong><p>Pesanan ini masuk dari menu online dan BELUM memotong stok/jurnal. Konfirmasi di bawah untuk memotong stok dan meneruskan pesanan ke Barista.</p>
                <button class="slcBtn" onclick='transaksiPage.konfirmasiPesanan(${JSON.stringify(trx.id)})'>&#10003; Konfirmasi & Proses Pesanan</button>
                <button class="slcBtn" style="background:#c0392b" onclick='transaksiPage.tolakPesanan(${JSON.stringify(trx.id)})'>&times; Tolak Pesanan</button>
               </div>`
            : '',
    ] : [];

    return [
        { section: 'titleHero', title: `Transaksi ${trx.tipe === 'jual' ? 'Jual' : 'Beli'} — ${escHtml(trx.nomor)}${isOnline ? ' <span class="badge badge-warning">Online</span>' : ''}`,
          description: `Lokasi: <strong>${escHtml(lokasi?.nama || '-')}</strong> &middot; Pelanggan: <strong>${escHtml(trx.pembeliNama || kontak?.nama || '-')}</strong> &middot; Status: <strong>${escHtml(trx.status)}</strong> &middot; Metode: <strong>${escHtml((trx.metodePembayaran || 'tunai').toUpperCase())}</strong>` },
        {
            section: 'articleFull',
            subtitle: `Baris Menu / Produk (${baris.length}) — Total: ${formatRupiah(trx.totalBayar)}`,
            lines: [
                `<button class="slcBtn" style="background:#555" onclick="web.navigate('transaksi')">&larr; Kembali</button>
                 ${menungguKonfirmasi ? '' : `<button class="slcBtn" style="background:#c0392b" onclick='transaksiPage.hapus(${JSON.stringify(id)})'>Hapus</button>`}`,
                ...antrianBlock,
                ...pesananOnlineBlock,
                `table:${JSON.stringify(tableRows)}`,
                ...paymentBlock,
            ],
            emptyText: 'Belum ada baris produk pada transaksi ini.',
        },
    ];
}
