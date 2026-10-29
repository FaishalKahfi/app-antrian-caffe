// ============================================================
// pages/home.js — Landing page publik Sistem Antrian & POS Caffe.
// ============================================================
pages.home = [
    {
        section: 'hero',
        title: 'Sistem Antrian & Kasir (POS) Caffe',
        tagline: 'Pesan dari meja, pantau antrian barista, sajikan lebih cepat',
        description: 'Aplikasi terpadu manajemen antrian pelanggan caffe, layar monitor panggilan suara (TTS), pemesanan menu mandiri (Dine-In & Takeaway), kasir POS multi-cabang, serta simulasi antrian M/M/c.',
        badges: ['Antrian Suara TTS', 'Layar TV Caffe', 'Self-Order Meja', 'Simulasi M/M/c', 'Pembayaran QRIS'],
        imgClass: 'di-coffee',
        cta: { text: 'Lihat Layar Monitor Antrian', link: 'layar-antrian' },
    },
    {
        section: 'features',
        items: [
            { icon: 'di-speaker', title: 'Panggilan Antrian Suara (TTS)', content: 'Panggil nomor antrian pelanggan otomatis dengan suara Bahasa Indonesia & nada bel chime caffe.', linkTarget: 'antrian', linkText: 'Buka Panel Barista &raquo;' },
            { icon: 'di-tv',      title: 'Layar Monitor TV Antrian',      content: 'Tampilan layar TV real-time untuk pelanggan: nomor sedang dipanggil, sedang diracik barista, dan siap diambil.', linkTarget: 'layar-antrian', linkText: 'Buka Layar TV &raquo;' },
            { icon: 'di-coffee',  title: 'Pesan Menu & Ambil Antrian',    content: 'Pelanggan memesan kopi & pastry langsung dari meja (Dine-In) atau Takeaway dan langsung mendapat tiket antrian.', linkTarget: 'toko/kopi-piawai', linkText: 'Coba Pesan Menu &raquo;' },
            { icon: 'di-cart',    title: 'Kasir Caffe + Tiket Otomatis',  content: 'Setiap transaksi di layar kasir otomatis menerbitkan Nomor Antrian Barista, memotong stok, dan memposting jurnal.', linkTarget: 'kasir', linkText: 'Buka Kasir Caffe &raquo;' },
            { icon: 'di-chart',   title: 'Simulasi & Model Antrian M/M/c', content: 'Analisis waktu tunggu (Wq), waktu layanan (Ws), utilisasi barista (ρ), dan simulasi Monte Carlo kejadian diskrit.', linkTarget: 'simulasi', linkText: 'Buka Simulasi &raquo;' },
            { icon: 'di-qrcode',  title: 'Pembayaran QRIS & Keuangan',    content: 'Terima pembayaran tunai maupun QRIS lengkap dengan laporan Laba Rugi, Neraca, dan Jurnal Umum otomatis.', linkTarget: 'login', linkText: 'Masuk Staf/Owner &raquo;' },
        ],
    },
    {
        section: 'articleFull',
        subtitle: 'Mulai Gunakan Sistem Antrian Caffe Sekarang',
        lines: [
            `<div class="info-card">
                <strong>Akses Cepat Pengujian (Demo Kopi Piawai Caffe)</strong>
                <p>Anda dapat langsung mencoba mengambil tiket antrian sebagai pelanggan atau masuk sebagai staf/barista caffe:</p>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
                    <button type="button" class="slcBtn" onclick="web.navigate('layar-antrian')">&#128250; Layar TV & Ambil Antrian Mandiri</button>
                    <button type="button" class="slcBtn" style="background:#1D9E75" onclick="web.navigate('toko/kopi-piawai')">&#9749; Pesan Menu Caffe Online</button>
                    <button type="button" class="slcBtn" style="background:#004761" onclick="auth.demoLogin('CAFFE01','owner','owner123')">&#127908; Masuk Cepat: Owner / Barista</button>
                </div>
            </div>`,
            'link:Daftarkan Cabang Caffe Baru:register',
            '---',
            'link:Sudah punya akun Caffe? Masuk di sini:login',
        ],
    },
];
