// ============================================================
// dataset.js — Konfigurasi menu (siteConfig) & loader paralel untuk
// Aplikasi Antrian & POS Caffe Multi-Tenant.
// ============================================================
const siteConfig = [
    { slug: 'home',          label: 'Beranda',        menu: true },
    { slug: 'layar-antrian', label: 'Layar Antrian',  menu: true },
    { slug: 'toko',          label: 'Pesan Menu',     menu: true },
    { slug: 'dashboard',     label: 'Dashboard',      menu: true, role: ['owner', 'kasir', 'gudang'] },
    {
        label: 'Antrian & Barista',
        menu: true,
        children: [
            { slug: 'antrian',       label: 'Kelola Antrian & Panggilan', role: ['owner', 'kasir', 'gudang'] },
            { slug: 'layar-antrian', label: 'Monitor TV Antrian',         role: ['owner', 'kasir', 'gudang'] },
            { slug: 'simulasi',      label: 'Simulasi Antrian (M/M/c)',   role: ['owner', 'kasir', 'gudang'] },
        ],
    },
    {
        label: 'Kasir & Pesanan',
        menu: true,
        children: [
            { slug: 'kasir',       label: 'Kasir + Antrian',  role: ['owner', 'kasir'] },
            { slug: 'transaksi',   label: 'Riwayat Transaksi',role: ['owner', 'kasir'] },
            { slug: 'toko-online', label: 'Pengaturan Menu Online', role: ['owner'] },
        ],
    },
    {
        label: 'Data Master Caffe',
        menu: true,
        children: [
            { slug: 'produk',     label: 'Menu & Produk',   role: ['owner', 'gudang'] },
            { slug: 'lokasi',     label: 'Counter & Gudang',role: ['owner', 'gudang'] },
            { slug: 'distribusi', label: 'Mutasi Stok',     role: ['owner', 'gudang'] },
            { slug: 'kontak',     label: 'Member & Supplier', role: ['owner', 'kasir', 'gudang'] },
        ],
    },
    {
        label: 'Keuangan',
        menu: true,
        children: [
            { slug: 'akun',    label: 'Bagan Akun',       role: ['owner'] },
            { slug: 'jurnal',  label: 'Jurnal Umum',      role: ['owner'] },
            { slug: 'laporan', label: 'Laporan Keuangan', role: ['owner'] },
        ],
    },
    { slug: 'tenant', label: 'Kelola Caffe', menu: true, role: ['superadmin'] },
    { slug: 'login',  label: 'Masuk Staf',   menu: true, guestOnly: true },
];

const pages = {};

const pageFiles = [
    'pages/shared.js',
    'pages/home.js',
    'pages/produk.js',
    'pages/kontak.js',
    'pages/lokasi.js',
    'pages/distribusi.js',
    'pages/transaksi.js',
    'pages/kasir.js',
    'pages/antrian.js',
    'pages/layar-antrian.js',
    'pages/simulasi.js',
    'toko.js',
    'pages/toko-online.js',
    'pages/akun.js',
    'pages/jurnal.js',
    'pages/laporan.js',
    'pages/tenant.js',
    'pages/dashboard.js',
];

function loadPageScripts(files, done) {
    const [first, ...rest] = files;
    const loadOne = (src) => new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = resolve;
        document.body.appendChild(s);
    });

    loadOne(first).then(() => Promise.all(rest.map(loadOne))).then(done);
}
