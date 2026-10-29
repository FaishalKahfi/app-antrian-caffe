// ============================================================
// pages/simulasi.js — Modul Simulasi & Pemodelan Antrian Caffe
// (Model Antrian M/M/c Multi-Barista + Simulasi Kejadian Diskrit Monte Carlo).
// Dirancang terintegrasi dengan engine.js (statGrid, barChart, renderTable,
// genericForm/openDrawer) dan tabel `antrian` caffe.
// ============================================================
web.routes.simulasi = 'resolveSimulasi';

const NAMA_SIMULASI = [
    'Andi Pratama', 'Bunga Citra', 'Chandra Wijaya', 'Dinda Kirana', 'Eko Saputra',
    'Fajar Nugroho', 'Gita Gutawa', 'Hendra Setiawan', 'Indah Permata', 'Joko Anwar',
    'Kartika Putri', 'Lukman Sardi', 'Maya Estianty', 'Nadia Vega', 'Oki Setiana',
    'Putra Ramadhan', 'Qory Sandioriva', 'Rizky Febian', 'Siti Nurhaliza', 'Tulus Wijaya',
];

const MENU_SIMULASI = [
    '2x Es Kopi Susu Gula Aren',
    '1x Hot Caffe Latte, 1x Croissant',
    '1x Iced Americano',
    '1x Caramel Macchiato, 1x French Fries',
    '1x Manual Brew V60 Arabica',
    '2x Iced Matcha Latte',
    '1x Belgian Dark Chocolate, 1x Kaya Toast',
];

function faktorial(n) {
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
}

/**
 * Perhitungan Teori Antrian M/M/c (Multi-Server / Multi-Barista):
 *   lambda = laju kedatangan pelanggan per jam
 *   mu     = laju pelayanan 1 barista per jam (60 / rataMenitLayanan)
 *   c      = jumlah barista aktif
 */
function hitungTeoriMMc(lambda, mu, c) {
    const rho = lambda / (c * mu);
    if (rho >= 1 || rho <= 0) {
        return {
            stabil: false,
            rho,
            P0: 0,
            Lq: Infinity,
            Ls: Infinity,
            WqMenit: Infinity,
            WsMenit: Infinity,
        };
    }
    const r = lambda / mu; // beban trafik (Erlang)
    let sum = 0;
    for (let n = 0; n < c; n++) {
        sum += Math.pow(r, n) / faktorial(n);
    }
    const cTerm = (Math.pow(r, c) / faktorial(c)) * (1 / (1 - rho));
    const P0 = 1 / (sum + cTerm);

    const Lq = (P0 * Math.pow(r, c) * rho) / (faktorial(c) * Math.pow(1 - rho, 2));
    const Ls = Lq + r;
    const WqMenit = (Lq / lambda) * 60;
    const WsMenit = (Ls / lambda) * 60;

    return { stabil: true, rho, P0, Lq, Ls, WqMenit, WsMenit };
}

const simulasiPage = {
    // Parameter default simulasi Caffe
    lambdaPerJam: 18,      // rata-rata 18 pelanggan datang per jam (1 pelanggan tiap 3.33 menit)
    rataLayananMenit: 4.5, // rata-rata 4.5 menit per pesanan oleh 1 barista (mu = 13.33 pelanggan/jam)
    jumlahBarista: 2,      // 2 barista aktif (c = 2)
    jumlahPelanggan: 12,   // jumlah pelanggan yang disimulasikan pada tabel Monte Carlo
    jamMulai: '09:00',
    hasilSimulasi: [],

    jalankanMonteCarlo() {
        const lambdaPerMenit = this.lambdaPerJam / 60;
        const rataLayanan = this.rataLayananMenit;
        const c = Math.max(1, parseInt(this.jumlahBarista, 10) || 2);
        const N = Math.max(3, Math.min(50, parseInt(this.jumlahPelanggan, 10) || 12));

        const [jamH, jamM] = String(this.jamMulai || '09:00').split(':').map(Number);
        const baseMenit = (jamH || 9) * 60 + (jamM || 0);

        // Waktu selesai masing-masing barista (server 1..c)
        const serverFreeAt = new Array(c).fill(baseMenit);
        let currentArrival = baseMenit;
        const rows = [];

        for (let i = 0; i < N; i++) {
            // Distribusi eksponensial antar-kedatangan: -ln(U) / lambda
            const u1 = Math.max(0.02, Math.min(0.98, Math.random()));
            const interArrival = i === 0 ? 0 : Math.round((-Math.log(u1) / lambdaPerMenit) * 10) / 10;
            currentArrival = Math.round((currentArrival + interArrival) * 10) / 10;

            // Pilih barista yang paling cepat kosong
            let bestServer = 0;
            for (let s = 1; s < c; s++) {
                if (serverFreeAt[s] < serverFreeAt[bestServer]) bestServer = s;
            }

            const startService = Math.max(currentArrival, serverFreeAt[bestServer]);
            const waitTime = Math.round((startService - currentArrival) * 10) / 10;

            // Distribusi eksponensial waktu layanan barista: -ln(U) * rataLayanan
            const u2 = Math.max(0.15, Math.min(0.95, Math.random()));
            const serviceTime = Math.max(1.5, Math.round((-Math.log(u2) * rataLayanan) * 10) / 10);

            const finishService = Math.round((startService + serviceTime) * 10) / 10;
            const turnaroundTime = Math.round((finishService - currentArrival) * 10) / 10;
            serverFreeAt[bestServer] = finishService;

            const isDineIn = i % 3 !== 2;
            const prefix = isDineIn ? 'A' : 'B';
            const nomorAntrian = `${prefix}-${String(i + 1).padStart(3, '0')}`;

            rows.push({
                urutan: i + 1,
                nomorAntrian,
                kodePrefix: prefix,
                namaPelanggan: NAMA_SIMULASI[i % NAMA_SIMULASI.length],
                tipeLayanan: isDineIn ? 'dine-in' : 'takeaway',
                nomorMeja: isDineIn ? `Meja ${String((i % 10) + 1).padStart(2, '0')}` : 'Takeaway',
                menu: MENU_SIMULASI[i % MENU_SIMULASI.length],
                interArrival,
                arrivalMenit: currentArrival,
                startMenit: startService,
                waitTime,
                serviceTime,
                finishMenit: finishService,
                turnaroundTime,
                barista: `Barista ${bestServer + 1}`,
            });
        }

        this.hasilSimulasi = rows;
        return rows;
    },

    formatMenitKeJam(totalMenit) {
        const totalDetik = Math.round(totalMenit * 60);
        const h = Math.floor(totalDetik / 3600) % 24;
        const m = Math.floor((totalDetik % 3600) / 60);
        const s = totalDetik % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    },

    bukaFormParameter() {
        web.openDrawer({
            title: 'Ubah Parameter Simulasi Antrian Caffe (M/M/c)',
            fields: [
                { type: 'number', name: 'lambdaPerJam', label: 'Laju Kedatangan Pelanggan (λ — pelanggan/jam)', value: this.lambdaPerJam, step: '0.5', required: true },
                { type: 'number', name: 'rataLayananMenit', label: 'Rata-rata Waktu Racik Barista (1/μ — menit/pesanan)', value: this.rataLayananMenit, step: '0.5', required: true },
                { type: 'number', name: 'jumlahBarista', label: 'Jumlah Server / Barista Aktif (c)', value: this.jumlahBarista, step: '1', required: true },
                { type: 'number', name: 'jumlahPelanggan', label: 'Jumlah Sampel Pelanggan Simulasi (N)', value: this.jumlahPelanggan, step: '1', required: true },
                { type: 'text', name: 'jamMulai', label: 'Jam Buka / Mulai Simulasi (HH:MM)', value: this.jamMulai, required: true },
            ],
            submitText: 'Hitung & Jalankan Simulasi Baru',
            onSubmit: 'event.preventDefault(); simulasiPage.terapkanParameter(this);',
        });
    },

    terapkanParameter(form) {
        const val = (n) => form.querySelector(`[name="${n}"]`)?.value;
        this.lambdaPerJam = Math.max(1, parseFloat(val('lambdaPerJam')) || 18);
        this.rataLayananMenit = Math.max(0.5, parseFloat(val('rataLayananMenit')) || 4.5);
        this.jumlahBarista = Math.max(1, Math.min(10, parseInt(val('jumlahBarista'), 10) || 2));
        this.jumlahPelanggan = Math.max(3, Math.min(50, parseInt(val('jumlahPelanggan'), 10) || 12));
        this.jamMulai = val('jamMulai') || '09:00';
        this.jalankanMonteCarlo();
        web.closeDrawer();
        web.navigate('simulasi');
    },

    acakUlang() {
        this.jalankanMonteCarlo();
        web.navigate('simulasi');
    },

    /** Masukkan beberapa sampel hasil simulasi ke tabel `antrian` aktif untuk diuji di Layar TV / Barista. */
    async kirimKeAntrianAktif() {
        if (!this.hasilSimulasi.length) this.jalankanMonteCarlo();
        if (!confirm('Tambahkan 3 pelanggan hasil simulasi terbaru sebagai antrian "Menunggu" di Caffe hari ini?')) return;
        const sampel = this.hasilSimulasi.slice(0, 3);
        try {
            for (const s of sampel) {
                await db.buatAntrianBaru({
                    namaPelanggan: s.namaPelanggan,
                    tipeLayanan: s.tipeLayanan,
                    kodePrefix: s.kodePrefix,
                    nomorMeja: s.nomorMeja,
                    loket: s.barista,
                    estimasiMenit: Math.max(2, Math.round(s.serviceTime)),
                    ringkasanPesanan: s.menu,
                    catatan: `Hasil Simulasi Monte Carlo (Est. racik ${s.serviceTime} mnt)`,
                });
            }
            alert('3 antrian baru berhasil dimasukkan ke daftar Antrian Caffe hari ini!');
            web.navigate('antrian');
        } catch (err) {
            alert('Gagal menambahkan ke antrian: ' + err.message);
        }
    },
};

async function resolveSimulasi() {
    const guard = requireLogin(['owner', 'kasir', 'gudang']);
    if (guard) return guard;

    if (!simulasiPage.hasilSimulasi.length) {
        simulasiPage.jalankanMonteCarlo();
    }

    const lambda = simulasiPage.lambdaPerJam;
    const mu = 60 / simulasiPage.rataLayananMenit;
    const c = simulasiPage.jumlahBarista;
    const teori = hitungTeoriMMc(lambda, mu, c);

    const rows = simulasiPage.hasilSimulasi;
    const simAvgWq = rows.length ? (rows.reduce((s, r) => s + r.waitTime, 0) / rows.length).toFixed(2) : '0.00';
    const simAvgService = rows.length ? (rows.reduce((s, r) => s + r.serviceTime, 0) / rows.length).toFixed(2) : '0.00';
    const simAvgWs = rows.length ? (rows.reduce((s, r) => s + r.turnaroundTime, 0) / rows.length).toFixed(2) : '0.00';

    // Grafik perbandingan waktu tunggu (Wq) & durasi layanan per pelanggan simulasi
    const chartItems = rows.slice(0, 10).map(r => ({
        label: `${r.nomorAntrian} (${r.namaPelanggan.split(' ')[0]})`,
        value: r.turnaroundTime,
    }));

    const tableRows = rows.map(r => ({
        No: r.nomorAntrian,
        Pelanggan: `${r.namaPelanggan} (${r.nomorMeja})`,
        Menu: r.menu,
        'Antar-Datang': `${r.interArrival} mnt`,
        'Waktu Datang': simulasiPage.formatMenitKeJam(r.arrivalMenit),
        Server: `<span class="badge">${escHtml(r.barista)}</span>`,
        'Mulai Racik': simulasiPage.formatMenitKeJam(r.startMenit),
        'Tunggu (Wq)': r.waitTime > 5 ? `<strong style="color:#c0392b">${r.waitTime} mnt</strong>` : `${r.waitTime} mnt`,
        'Durasi (Ts)': `${r.serviceTime} mnt`,
        Selesai: simulasiPage.formatMenitKeJam(r.finishMenit),
        'Total (Ws)': `<strong>${r.turnaroundTime} mnt</strong>`,
    }));

    const statusStabilitas = teori.stabil
        ? `<div class="info-card" style="border-left:4px solid #1D9E75">
               <strong>Sistem Antrian Caffe Stabil (Utilisasi ρ = ${(teori.rho * 100).toFixed(1)}% &lt; 100%)</strong>
               <p>Dengan <strong>${c} Barista</strong> (kapasitas total ${(c * mu).toFixed(1)} pesanan/jam) dan kedatangan <strong>${lambda} pelanggan/jam</strong>, antrian terkendali dengan estimasi waktu tunggu rata-rata teoritis <strong>${teori.WqMenit.toFixed(2)} menit</strong>.</p>
           </div>`
        : `<div class="info-card" style="border-left:4px solid #c0392b">
               <strong>Peringatan: Sistem Antrian Overload / Tidak Stabil (Utilisasi ρ = ${(teori.rho * 100).toFixed(1)}% &ge; 100%)</strong>
               <p>Laju kedatangan pelanggan (${lambda}/jam) melebihi kapasitas pelayanan ${c} barista (${(c * mu).toFixed(1)}/jam). Tambahkan jumlah Barista (c) atau percepat waktu peracikan minuman!</p>
           </div>`;

    return [
        {
            section: 'titleHero',
            title: 'Simulasi & Pemodelan Antrian Caffe (M/M/c)',
            description: 'Evaluasi kinerja layanan Barista Caffe menggunakan model matematis antrian Multi-Server (M/M/c) dan Simulasi Kejadian Diskrit (Monte Carlo).',
        },
        {
            section: 'statGrid',
            stats: [
                { value: `${(teori.rho * 100).toFixed(1)}%`, label: `Utilisasi Barista (ρ) [c=${c}]` },
                { value: teori.stabil ? `${teori.Lq.toFixed(2)} org` : 'Overload', label: 'Rata-rata Antre Teoritis (Lq)' },
                { value: teori.stabil ? `${teori.WqMenit.toFixed(2)} mnt` : '∞', label: 'Waktu Tunggu Teoritis (Wq)' },
                { value: teori.stabil ? `${teori.WsMenit.toFixed(2)} mnt` : '∞', label: 'Total Waktu Sistem Teoritis (Ws)' },
                { value: `${simAvgWq} mnt`, label: `Rata-rata Wq Simulasi (N=${rows.length})` },
                { value: `${simAvgWs} mnt`, label: `Rata-rata Ws Simulasi (N=${rows.length})` },
            ],
        },
        {
            section: 'article',
            leftCol: {
                subtitle: 'Parameter Model Saat Ini',
                lines: [
                    `card:Laju Kedatangan (λ):${lambda} pelanggan / jam (rata-rata tiap ${(60 / lambda).toFixed(2)} menit)`,
                    `card:Laju Pelayanan 1 Barista (μ):${mu.toFixed(2)} pesanan / jam (${simulasiPage.rataLayananMenit} menit / pesanan)`,
                    `card:Jumlah Barista Aktif (c):${c} Barista (Kapasitas ${(c * mu).toFixed(1)} pesanan / jam)`,
                    `card:Peluang Caffe Kosong (P0):${teori.stabil ? (teori.P0 * 100).toFixed(2) + '%' : '0%'}`,
                ],
            },
            rightCol: {
                subtitle: 'Kontrol & Skenario Simulasi',
                lines: [
                    statusStabilitas,
                    `<div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button type="button" class="slcBtn" onclick="simulasiPage.bukaFormParameter()">&#9881; Ubah Parameter (λ, μ, c, N)</button>
                        <button type="button" class="slcBtn" style="background:#1D9E75" onclick="simulasiPage.acakUlang()">&#127922; Bangkitkan Ulang Sampel Monte Carlo</button>
                        <button type="button" class="slcBtn" style="background:#004761" onclick="simulasiPage.kirimKeAntrianAktif()">+ Masukkan Sampel ke Antrian Caffe</button>
                    </div>`,
                ],
            },
        },
        {
            section: 'barChart',
            title: 'Grafik Total Waktu di Sistem (Ws = Tunggu + Racik, dalam Menit) per Pelanggan',
            items: chartItems,
        },
        {
            section: 'articleFull',
            subtitle: `Tabel Simulasi Kejadian Diskrit Pelanggan Caffe (${rows.length} Pelanggan —Rata-rata Racik Simulasi: ${simAvgService} mnt)`,
            lines: [
                `table:${JSON.stringify(tableRows)}`,
            ],
            tableOpts: { rawKeys: ['Server', 'Tunggu (Wq)', 'Total (Ws)'] },
            emptyText: 'Belum ada data simulasi.',
        },
    ];
}
