// ============================================================
// toko.js — Etalase Menu Caffe & Pemesanan Antrian Online Publik (?toko).
// Pengunjung umum (tanpa login) bisa memilih caffe, memesan kopi/pastry
// dari meja (Dine-In) atau Takeaway, dan langsung mendapatkan Tiket Nomor
// Antrian Caffe beserta akses ke Layar Monitor Antrian.
// ============================================================
web.routes.toko = 'resolveToko';

const tokoPage = createCatalogCart('tokoPage', {
    getPrice: (p) => p.hargaJual || 0,
    getStock: (p) => (p.stok !== undefined ? p.stok : null),
    cartTitle: 'Pesanan Menu & Ambil Antrian',
    emptyCatalogMsg: 'Caffe ini belum memiliki menu aktif.',
    emptyCartMsg: 'Keranjang masih kosong. Ketuk menu kopi/makanan untuk memesan.',
    confirmLabel: (ctrl) => `Kirim Pesanan & Ambil Nomor Antrian (${formatRupiah(ctrl.total())})`,
    extraFieldsHtml: () => `
        <div class="a-row"><label class="a-label">Nama Anda <span style="color:var(--aColor,#DF8C43)">*</span></label>
            <input type="text" name="pembeliNama" required maxlength="120" placeholder="mis. Kak Rina"></div>
        <div class="a-row"><label class="a-label">No. WhatsApp / Telepon <span style="color:var(--aColor,#DF8C43)">*</span></label>
            <input type="text" name="pembeliTelepon" required maxlength="40" placeholder="08xxxxxxxxxx"></div>
        <div class="a-row"><label class="a-label">Tipe Layanan Caffe</label>
            <select name="tipeLayanan">
                <option value="dine-in">Dine-In (Minum/Makan di Meja &mdash; Antrian A)</option>
                <option value="takeaway">Takeaway (Bawa Pulang &mdash; Antrian B)</option>
            </select></div>
        <div class="a-row"><label class="a-label">Nomor Meja (Jika Dine-In)</label>
            <input type="text" name="nomorMeja" value="Meja 01" maxlength="30" placeholder="mis. Meja 04 atau Takeaway"></div>
        <div class="a-row"><label class="a-label">Catatan Barista (Gula / Es / Request)</label>
            <textarea name="pembeliAlamat" rows="2" maxlength="240" placeholder="mis. Less sugar, normal ice, oat milk"></textarea></div>`,
    onCartChange: (ctrl) => ctrl.updateFab(),
    onConfirm: async (cart, form) => tokoPage.kirimPesanan(cart, form),
});

Object.assign(tokoPage, {
    tenant: null,
    tenantId: '',

    async muatToko(kunciToko) {
        const { tenant, produk } = await db.storefrontTokoDetail(kunciToko);
        this.tenant = tenant;
        this.tenantId = kunciToko;
        this.kataKunci = '';
        this.kategoriAktif = '';
        this.setProdukList(produk || []);
    },

    updateFab() {
        const fab = web.gebi('tokoPageFab');
        if (!fab) return;
        fab.querySelector('.catcart-fab-count').textContent = this.jumlahItem();
        fab.querySelector('.catcart-fab-total').textContent = formatRupiah(this.total());
        fab.classList.toggle('hide', this.jumlahItem() === 0);
    },

    async kirimPesanan(cart, form) {
        const pembeli = {
            nama: form.querySelector('[name="pembeliNama"]')?.value.trim() || '',
            telepon: form.querySelector('[name="pembeliTelepon"]')?.value.trim() || '',
            tipeLayanan: form.querySelector('[name="tipeLayanan"]')?.value || 'dine-in',
            nomorMeja: form.querySelector('[name="nomorMeja"]')?.value.trim() || 'Meja 01',
            alamat: form.querySelector('[name="pembeliAlamat"]')?.value.trim() || '',
        };
        if (!pembeli.nama || !pembeli.telepon) throw new Error('Nama & nomor WhatsApp wajib diisi.');

        const items = cart.map(c => ({ produkId: c.produkId, qty: c.qty }));
        const hasil = await db.storefrontPesan({ tenantId: this.tenantId, pembeli, items });
        const ringkasan = cart.map(c => `${c.qty}x ${c.nama}`).join(', ');
        this.updateFab();

        // Tampilkan Tiket Nomor Antrian Caffe langsung di Drawer!
        web.openDrawer({
            title: `Tiket Antrian Anda: ${hasil.nomorAntrian || 'A-001'}`,
            bodyHtml: `
                <div class="queue-ticket-card">
                    <div class="queue-ticket-header">
                        <strong>${escHtml(this.tenant?.nama || 'Kopi Piawai Caffe')}</strong>
                        <span>Tiket Pesanan & Antrian Online</span>
                    </div>
                    <div class="queue-ticket-number">${escHtml(hasil.nomorAntrian || 'A-001')}</div>
                    <div class="queue-ticket-badge">${escHtml((pembeli.tipeLayanan || 'dine-in').toUpperCase())} &bull; ${escHtml(pembeli.nomorMeja)}</div>
                    <div class="queue-ticket-meta">
                        <div><span>Pelanggan:</span> <strong>${escHtml(pembeli.nama)}</strong></div>
                        <div><span>No. Pesanan:</span> <strong>${escHtml(hasil.nomor || hasil.id)}</strong></div>
                        <div><span>Total Bayar:</span> <strong>${formatRupiah(hasil.total)}</strong></div>
                        <div><span>Estimasi Sajian:</span> <strong>&plusmn; ${Number(hasil.estimasiMenit) || 5} menit</strong></div>
                    </div>
                    <div class="queue-ticket-items">
                        <strong>Rincian Menu:</strong>
                        <p>${escHtml(ringkasan)}</p>
                        ${pembeli.alamat ? `<small>Catatan: ${escHtml(pembeli.alamat)}</small>` : ''}
                    </div>
                    <div class="queue-ticket-footer">
                        Pesanan Anda telah masuk ke antrian Barista! Silakan pantau status nomor antrian <strong>${escHtml(hasil.nomorAntrian || '')}</strong> di Layar Monitor Antrian.
                    </div>
                </div>
                <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
                    <button type="button" class="slcBtn" style="background:#1D9E75" onclick='web.closeDrawer(); web.navigate(${JSON.stringify('layar-antrian/' + (this.tenant?.slug || this.tenantId))})'>&#128250; Pantau di Layar Antrian</button>
                    <button type="button" class="slcBtn" onclick="window.print()">&#128424; Cetak / Simpan Tiket</button>
                </div>`,
        });
    },

    pageBlocks() {
        const slugOrId = this.tenant.slug || this.tenant.id;
        const catalogHtml = `
            <div class="catcart-toolbar">
                <input type="search" placeholder="Cari kopi, matcha, pastry..." oninput="tokoPage.cariProduk(this.value)" class="catcart-search">
                <div class="catcart-chips" id="tokoPageChips">${this.chipsHtml()}</div>
            </div>
            <div id="tokoPageGrid">${this.gridHtml()}</div>
            <div class="catcart-fab hide" id="tokoPageFab" onclick="tokoPage.openCart()">
                <span>&#9749; <span class="catcart-fab-count">0</span> menu</span>
                <span class="catcart-fab-total">Rp0</span>
            </div>`;
        return [
            {
                section: 'titleHero',
                title: escHtml(this.tenant.nama),
                description: `${escHtml(this.tenant.alamat || '')}${this.tenant.telepon ? ' &middot; ' + escHtml(this.tenant.telepon) : ''}`,
            },
            {
                section: 'articleFull',
                lines: [
                    `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
                        <button class="slcBtn" style="background:#555" onclick="web.navigate('toko')">&larr; Semua Caffe</button>
                        <button class="slcBtn" style="background:#004761" onclick='web.navigate(${JSON.stringify('layar-antrian/' + slugOrId)})'>&#128250; Lihat Layar Antrian Live</button>
                    </div>`,
                    this.tenant.deskripsi ? `<div class="info-card">${escHtml(this.tenant.deskripsi)}</div>` : '',
                    catalogHtml,
                ],
            },
        ];
    },
});

async function resolveToko(sub) {
    if (sub) {
        try {
            await tokoPage.muatToko(sub);
        } catch (err) {
            return [{ section: 'titleHero', title: 'Caffe Tidak Ditemukan', description: escHtml(err.message) }];
        }
        if (!tokoPage.tenant) return [{ section: 'titleHero', title: 'Caffe Tidak Ditemukan' }];
        return tokoPage.pageBlocks();
    }

    db.storefrontTokoList()
        .then(renderTokoListGrid)
        .catch(err => renderTokoListGrid(null, err));

    return [
        { section: 'titleHero', title: 'Pesan Menu & Ambil Antrian Caffe', description: 'Pilih cabang caffe untuk melihat katalog menu kopi & pastry, pesan langsung dari meja atau takeaway, dan dapatkan Nomor Antrian Barista.' },
        {
            section: 'articleFull',
            lines: [`<div class="catcart-grid" id="tokoListGrid"><p>Memuat daftar caffe&hellip;</p></div>`],
        },
    ];
}

function renderTokoListGrid(daftar, err) {
    const grid = web.gebi('tokoListGrid');
    if (!grid) return;

    if (err) { grid.innerHTML = `<p>Gagal memuat daftar caffe: ${escHtml(err.message)}</p>`; return; }
    if (!daftar || !daftar.length) { grid.innerHTML = 'Belum ada caffe yang membuka menu online saat ini.'; return; }

    grid.innerHTML = daftar.map(t => `
        <div class="catcart-product-card" style="cursor:default">
            <span class="catcart-product-nama">&#9749; ${escHtml(t.nama)}</span>
            <span class="catcart-product-kategori">${escHtml(t.deskripsi || t.alamat || '') || '&nbsp;'}</span>
            ${t.telepon ? `<span class="catcart-product-harga">${escHtml(t.telepon)}</span>` : ''}
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;width:100%">
                <button type="button" class="slcBtn" style="flex:1;padding:8px 10px;font-size:12px" onclick='web.navigate(${JSON.stringify('toko/' + (t.slug || t.id))})'>Pesan Menu</button>
                <button type="button" class="slcBtn" style="flex:1;padding:8px 10px;font-size:12px;background:#004761" onclick='web.navigate(${JSON.stringify('layar-antrian/' + (t.slug || t.id))})'>Layar Antrian</button>
            </div>
        </div>`).join('');
}
