// ============================================================
// pages/kasir.js — Layar Kasir Caffe & Pembuatan Tiket Antrian Otomatis.
// Menggunakan mesin bersama createInstantDocumentPage (pages/shared.js):
// pilih Counter/Member di atas -> ketuk menu kopi/makanan di katalog ->
// isi Nama Pelanggan, Tipe Layanan (Dine-In/Takeaway), & Nomor Meja ->
// satu tombol "Bayar & Buat Antrian" langsung membuat transaksi + potong stok
// + posting jurnal + tiket Nomor Antrian Barista!
// ============================================================
web.routes.kasir = 'resolveKasir';

const kasirPage = createInstantDocumentPage('kasirPage', {
    headerTable: 'transaksi', lineTable: 'transaksi_produk', headerIdField: 'transaksiId',
    nomorPrefix: () => 'TR-',
    detailRoute: () => 'transaksi/detail-',
    pageTitle: () => 'Kasir & Antrian Caffe',
    pageDesc: () => 'Pilih counter & pelanggan di atas, ketuk menu kopi/makanan untuk menambah ke keranjang, lalu klik keranjang di kanan-bawah untuk bayar & cetak nomor antrian barista.',
    lokasiLabel: () => 'Counter / Lokasi',
    kontakLabel: () => 'Member / Pelanggan',
    kontakEmptyLabel: () => 'pelanggan walk-in',
    kontakFilter: (k) => k.tipe === 'customer',
    getPrice: (p) => p.hargaJual || 0,
    allowPriceEdit: false,
    cartTitle: 'Pesanan & Tiket Antrian Caffe',
    emptyCatalogMsg: 'Tidak ada menu caffe yang cocok.',
    emptyCartMsg: 'Keranjang pesanan masih kosong. Ketuk menu kopi/pastry di katalog.',
    extraFieldsHtml: () => `
        <div class="a-row"><label class="a-label">Nama Panggilan Pelanggan <span style="color:var(--aColor,#DF8C43)">*</span></label>
            <input type="text" name="pembeliNama" placeholder="mis. Kak Andi" required maxlength="80"></div>
        <div class="a-row"><label class="a-label">Tipe Layanan Caffe</label>
            <select name="tipeLayanan">
                <option value="dine-in">Dine-In (Minum/Makan di Tempat &mdash; Antrian A)</option>
                <option value="takeaway">Takeaway (Bawa Pulang &mdash; Antrian B)</option>
            </select></div>
        <div class="a-row"><label class="a-label">Nomor Meja / Keterangan</label>
            <input type="text" name="nomorMeja" value="Meja 01" placeholder="mis. Meja 04 atau Takeaway" maxlength="30"></div>
        <div class="a-row"><label class="a-label">Counter Barista Tujuan</label>
            <select name="loket">
                <option value="Barista 1">Barista 1 (Espresso & Signature)</option>
                <option value="Barista 2">Barista 2 (Manual Brew & Non-Coffee)</option>
                <option value="Kasir & Kitchen">Kasir & Kitchen (Pastry/Snack)</option>
            </select></div>
        <div class="a-row"><label class="a-label">Catatan Barista (Gula / Es / Susu)</label>
            <input type="text" name="catatanPesanan" placeholder="mis. Less sugar, normal ice, oat milk" maxlength="140"></div>
        <div class="a-row"><label class="a-label">Metode Pembayaran</label>
            <select name="metodePembayaran">
                <option value="tunai">Tunai / Cash</option>
                <option value="qris">QRIS Caffe</option>
            </select></div>`,
    readExtra: (form) => ({
        pembeliNama: form.querySelector('[name="pembeliNama"]')?.value?.trim() || 'Pelanggan Caffe',
        tipeLayanan: form.querySelector('[name="tipeLayanan"]')?.value || 'dine-in',
        nomorMeja: form.querySelector('[name="nomorMeja"]')?.value?.trim() || 'Meja 01',
        loket: form.querySelector('[name="loket"]')?.value || 'Barista 1',
        catatanPesanan: form.querySelector('[name="catatanPesanan"]')?.value?.trim() || '',
        metodePembayaran: form.querySelector('[name="metodePembayaran"]')?.value || 'tunai',
    }),
    headerExtra: (ctrl, extra) => ({
        metodePembayaran: extra.metodePembayaran,
        totalBayar: ctrl.total(),
        pembeliNama: extra.pembeliNama,
        nomorMeja: extra.nomorMeja,
        tipeLayanan: extra.tipeLayanan,
        catatan: extra.catatanPesanan,
    }),
    lineExtra: (c) => ({ subtotal: c.qty * c.harga }),
    confirmLabel: (ctrl) => `Bayar & Buat Nomor Antrian (${formatRupiah(ctrl.total())})`,
    stockDelta: () => -1,
    afterConfirm: async (header, cart, tipe, ctrl) => {
        if (header.metodePembayaran === 'qris') await qrisPage.buatPembayaran(header.id, header.totalBayar);
        await jurnalPage.postingTransaksi(header, cart, ctrl);

        // Buat tiket antrian caffe otomatis untuk pesanan kasir ini
        const ringkasan = cart.map(c => `${c.qty}x ${c.nama}`).join(', ');
        const antrian = await db.buatAntrianBaru({
            transaksiId: header.id,
            namaPelanggan: header.pembeliNama || 'Pelanggan Caffe',
            tipeLayanan: header.tipeLayanan || 'dine-in',
            kodePrefix: (header.tipeLayanan || 'dine-in') === 'dine-in' ? 'A' : 'B',
            nomorMeja: header.nomorMeja || 'Meja 01',
            loket: (header.tipeLayanan || 'dine-in') === 'dine-in' ? 'Barista 1' : 'Barista 2',
            ringkasanPesanan: ringkasan,
            catatan: header.catatan || '',
        });
        await db.update('transaksi', header.id, { nomorAntrian: antrian.nomorAntrian });
    },
});

async function resolveKasir() {
    const guard = requireLogin(['owner', 'kasir']);
    if (guard) return guard;

    await kasirPage.load('jual');
    kasirPage.kataKunci = '';
    kasirPage.kategoriAktif = '';

    if (!kasirPage.lokasiList.length) {
        return [
            { section: 'titleHero', title: 'Kasir & Antrian Caffe', description: 'Layar kasir untuk pesanan caffe & pembuatan nomor antrian otomatis.' },
            { section: 'articleFull', subtitle: 'Belum Bisa Berjualan', lines: ['Buat minimal 1 lokasi counter di menu Lokasi sebelum memakai layar Kasir.'] },
        ];
    }
    if (!kasirPage.produkList.length) {
        return [
            { section: 'titleHero', title: 'Kasir & Antrian Caffe', description: 'Layar kasir untuk pesanan caffe & pembuatan nomor antrian otomatis.' },
            { section: 'articleFull', subtitle: 'Belum Ada Menu Produk', lines: ['Tambahkan menu kopi/makanan aktif di menu Produk sebelum memakai layar Kasir.'] },
        ];
    }

    return kasirPage.pageBlocks('jual');
}
