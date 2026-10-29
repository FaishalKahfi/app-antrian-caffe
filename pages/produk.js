// ============================================================
// pages/produk.js — CRUD master menu kopi, minuman & makanan Caffe.
// ============================================================
web.routes.produk = 'resolveProduk';

const produkPage = {
    fields(p = {}) {
        return [
            { type: 'hidden', name: 'id', value: p.id || '' },
            { type: 'text',   name: 'kode',          label: 'Kode Menu',                value: p.kode || '', placeholder: 'mis. CF001', maxlength: 40 },
            { type: 'text',   name: 'nama',          label: 'Nama Menu / Produk',       value: p.nama || '', placeholder: 'mis. Es Kopi Susu Gula Aren', required: true, maxlength: 120 },
            { type: 'text',   name: 'kategori',      label: 'Kategori Menu',            value: p.kategori || '', placeholder: 'mis. Signature Coffee / Pastry & Snack', maxlength: 60 },
            { type: 'select', name: 'satuan',        label: 'Satuan',                   value: p.satuan || 'cup',
              options: ['cup', 'porsi', 'pcs', 'botol', 'kg', 'gram', 'liter', 'pak'] },
            { type: 'number', name: 'hargaBeli',     label: 'HPP / Harga Modal (Rp)',   value: p.hargaBeli ?? 0 },
            { type: 'number', name: 'hargaJual',     label: 'Harga Jual (Rp)',          value: p.hargaJual ?? 0, required: true },
            { type: 'number', name: 'estimasiMenit', label: 'Estimasi Racik Barista (Menit)', value: p.estimasiMenit ?? 4 },
            { type: 'select', name: 'aktif',         label: 'Status Menu',              value: p.aktif ?? 1,
              options: [{ value: 1, label: 'Tersedia (Aktif)' }, { value: 0, label: 'Habis / Nonaktif' }] },
        ];
    },

    bukaTambah() {
        web.openDrawer({
            title: 'Tambah Menu Caffe Baru',
            fields: this.fields(),
            submitText: 'Simpan Menu',
            onSubmit: 'event.preventDefault(); produkPage.simpan(this);',
        });
    },

    async bukaEdit(id) {
        const p = await db.find('produk', x => x.id === id);
        if (!p) return alert('Menu tidak ditemukan.');
        web.openDrawer({
            title: 'Edit Menu Caffe',
            fields: this.fields(p),
            submitText: 'Simpan Perubahan',
            onSubmit: 'event.preventDefault(); produkPage.simpan(this);',
        });
    },

    async simpan(form) {
        const val = (n) => form.querySelector(`[name="${n}"]`)?.value;
        const id = val('id');
        const data = {
            kode: val('kode'),
            nama: val('nama').trim(),
            kategori: val('kategori'),
            satuan: val('satuan'),
            hargaBeli: parseFloat(val('hargaBeli')) || 0,
            hargaJual: parseFloat(val('hargaJual')) || 0,
            estimasiMenit: parseInt(val('estimasiMenit'), 10) || 4,
            aktif: parseInt(val('aktif'), 10),
        };
        if (!data.nama) return alert('Nama menu wajib diisi.');

        try {
            if (id) await db.update('produk', id, data);
            else await db.insert('produk', { ...data, createdAt: new Date().toISOString() });
        } catch (err) { return alert('Gagal menyimpan: ' + err.message); }

        web.closeDrawer();
        web.navigate('produk');
    },

    async hapus(id) {
        if (!confirm('Hapus menu ini? Data stok terkait di semua lokasi juga sebaiknya dihapus manual.')) return;
        try { await db.remove('produk', id); } catch (err) { return alert('Gagal menghapus: ' + err.message); }
        web.navigate('produk');
    },
};

async function resolveProduk() {
    const guard = requireLogin(['owner', 'gudang']);
    if (guard) return guard;

    const rows = await db.query('produk', () => true);
    const tableRows = rows.map(p => ({
        Kode: p.kode || '-',
        'Nama Menu': p.nama,
        Kategori: p.kategori || '-',
        Satuan: p.satuan || 'cup',
        'Est. Racik': `${p.estimasiMenit || 4} mnt`,
        'HPP Modal': formatRupiah(p.hargaBeli),
        'Harga Jual': formatRupiah(p.hargaJual),
        Status: p.aktif ? '<span class="badge badge-success">Aktif</span>' : '<span class="badge badge-muted">Nonaktif</span>',
        Aksi: `<button class="slcBtn" onclick='produkPage.bukaEdit(${JSON.stringify(p.id)})'>Edit</button>
               <button class="slcBtn" style="background:#c0392b" onclick='produkPage.hapus(${JSON.stringify(p.id)})'>Hapus</button>`,
    }));

    return [
        { section: 'titleHero', title: 'Menu & Produk Caffe', description: 'Kelola daftar menu kopi, minuman non-kopi, pastry, dan estimasi waktu peracikan barista.' },
        {
            section: 'articleFull',
            subtitle: `Daftar Menu Caffe (${rows.length})`,
            lines: [
                '<button class="slcBtn" onclick="produkPage.bukaTambah()">+ Tambah Menu Caffe</button>',
                `table:${JSON.stringify(tableRows)}`,
            ],
            tableOpts: { rawKeys: ['Status', 'Aksi'] },
            emptyText: 'Belum ada menu. Klik "+ Tambah Menu Caffe" untuk mulai.',
        },
    ];
}

function formatRupiah(n) {
    const num = Number(n) || 0;
    return 'Rp' + num.toLocaleString('id-ID');
}
