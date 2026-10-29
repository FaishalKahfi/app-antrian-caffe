// ============================================================
// pages/antrian.js — Manajemen Antrian Pesanan & Panggilan Barista Caffe.
// Mengikuti pola arsitektur engine.js (statGrid, articleFull, renderTable
// dengan rawKeys, dan form drawer web.openDrawer).
// Dilengkapi panggilan suara otomatis (Web Speech API Bahasa Indonesia +
// chime bel Web Audio API) serta cetak tiket antrian termal.
// ============================================================
web.routes.antrian = 'resolveAntrian';

const STATUS_ANTRIAN_BADGE = {
    menunggu:  { cls: 'badge-warning', label: 'Menunggu' },
    dipanggil: { cls: 'badge-call',    label: 'Dipanggil' },
    diproses:  { cls: 'badge-process', label: 'Diracik Barista' },
    siap:      { cls: 'badge-success', label: 'Siap Diambil' },
    selesai:   { cls: 'badge-muted',   label: 'Selesai' },
    batal:     { cls: 'badge-danger',  label: 'Batal' },
};

const antrianPage = {
    filterStatus: 'aktif', // 'aktif' | 'semua' | 'menunggu' | 'dipanggil' | 'diproses' | 'siap' | 'selesai'
    filterLoket: '',
    suaraAktif: true,

    /** Bunyi bel chime bandara/caffe menggunakan Web Audio API (tanpa file mp3 eksternal). */
    bunyiBel() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const playTone = (freq, start, dur) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
                gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
                gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.04);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + start);
                osc.stop(ctx.currentTime + start + dur);
            };
            // Nada Ding-Dong Caffe (E5 -> C5 -> G5)
            playTone(659.25, 0.0, 0.35);
            playTone(523.25, 0.28, 0.45);
            playTone(783.99, 0.60, 0.55);
        } catch (e) {}
    },

    /** Ubah "A-003" menjadi ejaan jelas untuk TTS: "A, kosong kosong tiga". */
    ejaNomor(nomor) {
        const clean = String(nomor || '').replace('-', ' ');
        return clean.split('').map(ch => (ch === '0' ? 'kosong' : ch)).join(' ');
    },

    /** Pengumuman suara panggilan antrian (Web Speech API Bahasa Indonesia). */
    ucapkan(teks) {
        this.bunyiBel();
        if (!this.suaraAktif || typeof window.speechSynthesis === 'undefined') return;
        try {
            window.speechSynthesis.cancel();
            setTimeout(() => {
                const utter = new SpeechSynthesisUtterance(teks);
                utter.lang = 'id-ID';
                utter.rate = 0.92;
                utter.pitch = 1.02;
                const voices = window.speechSynthesis.getVoices();
                const idVoice = voices.find(v => v.lang && v.lang.toLowerCase().includes('id'));
                if (idVoice) utter.voice = idVoice;
                window.speechSynthesis.speak(utter);
            }, 450);
        } catch (e) {}
    },

    toggleSuara() {
        this.suaraAktif = !this.suaraAktif;
        web.navigate('antrian');
    },

    setFilter(status) {
        this.filterStatus = status;
        web.navigate('antrian');
    },

    setLoket(loket) {
        this.filterLoket = loket;
        web.navigate('antrian');
    },

    /** Panggil antrian menunggu paling awal (FIFO - First In First Out). */
    async panggilBerikutnya() {
        const today = new Date().toISOString().slice(0, 10);
        const rows = await db.query('antrian', a =>
            a.tanggal === today &&
            a.status === 'menunggu' &&
            (!this.filterLoket || a.loket === this.filterLoket)
        );
        const sorted = rows.sort((a, b) => (a.waktuAmbil || '').localeCompare(b.waktuAmbil || ''));
        if (!sorted.length) {
            return alert('Tidak ada antrian berstatus "Menunggu" saat ini.');
        }
        await this.panggil(sorted[0].id);
    },

    /** Panggil atau panggil ulang satu nomor antrian. */
    async panggil(id) {
        const item = await db.find('antrian', a => a.id === id);
        if (!item) return alert('Data antrian tidak ditemukan.');
        const now = new Date().toISOString();
        const patch = {
            status: item.status === 'siap' ? 'siap' : 'dipanggil',
            waktuPanggil: item.waktuPanggil || now,
        };
        try {
            await db.update('antrian', id, patch);
            const kalimat = item.status === 'siap'
                ? `Panggilan pesanan siap. Nomor antrian ${this.ejaNomor(item.nomorAntrian)}, atas nama ${item.namaPelanggan}, pesanan Anda sudah siap di ${item.loket || 'Counter Barista'}.`
                : `Nomor antrian ${this.ejaNomor(item.nomorAntrian)}, atas nama ${item.namaPelanggan}, silakan menuju ${item.loket || 'Barista'}.`;
            this.ucapkan(kalimat);
        } catch (err) {
            return alert('Gagal memanggil antrian: ' + err.message);
        }
        web.navigate('antrian');
    },

    /** Ubah status ke 'diproses' (sedang diracik barista), 'siap' (siap disajikan/diambil), 'selesai', atau 'batal'. */
    async ubahStatus(id, statusBaru) {
        const item = await db.find('antrian', a => a.id === id);
        if (!item) return alert('Data antrian tidak ditemukan.');
        const now = new Date().toISOString();
        const patch = { status: statusBaru };
        if (statusBaru === 'diproses' && !item.waktuPanggil) patch.waktuPanggil = now;
        if (statusBaru === 'siap') {
            if (!item.waktuPanggil) patch.waktuPanggil = now;
            patch.waktuSiap = now;
        }
        if (statusBaru === 'selesai') {
            if (!item.waktuPanggil) patch.waktuPanggil = now;
            if (!item.waktuSiap) patch.waktuSiap = now;
            patch.waktuSelesai = now;
        }
        try {
            await db.update('antrian', id, patch);
            if (statusBaru === 'siap') {
                this.ucapkan(`Pesanan nomor antrian ${this.ejaNomor(item.nomorAntrian)}, atas nama ${item.namaPelanggan}, sudah siap disajikan. Terima kasih.`);
            }
        } catch (err) {
            return alert('Gagal memperbarui status: ' + err.message);
        }
        web.navigate('antrian');
    },

    bukaTambah() {
        web.openDrawer({
            title: 'Ambil / Tambah Antrian Caffe Baru',
            fields: [
                { type: 'text', name: 'namaPelanggan', label: 'Nama Pelanggan', placeholder: 'mis. Kak Budi / Meja 04', required: true, maxlength: 80 },
                { type: 'select', name: 'tipeLayanan', label: 'Tipe Layanan', value: 'dine-in', required: true,
                  options: [
                      { value: 'dine-in', label: 'Dine-In (Makan/Minum di Tempat — Kode A)' },
                      { value: 'takeaway', label: 'Takeaway (Bawa Pulang — Kode B)' },
                      { value: 'delivery', label: 'Delivery / Ojol (Kode B)' },
                  ] },
                { type: 'text', name: 'nomorMeja', label: 'Nomor Meja / Keterangan Tempat', value: 'Meja 01', placeholder: 'mis. Meja 04 atau Takeaway', maxlength: 30 },
                { type: 'select', name: 'loket', label: 'Counter / Barista Tujuan', value: 'Barista 1',
                  options: ['Barista 1', 'Barista 2', 'Kasir & Kitchen'] },
                { type: 'text', name: 'ringkasanPesanan', label: 'Ringkasan Pesanan Menu', placeholder: 'mis. 2x Es Kopi Susu, 1x Croissant', maxlength: 200 },
                { type: 'number', name: 'estimasiMenit', label: 'Estimasi Waktu Sajian (Menit)', value: 5 },
                { type: 'text', name: 'telepon', label: 'No. WhatsApp (Opsional)', placeholder: '08xxxxxxxxxx', maxlength: 30 },
                { type: 'textarea', name: 'catatan', label: 'Catatan Barista (Gula/Es/Request)', placeholder: 'mis. Less sugar, normal ice, oat milk', rows: 2, maxlength: 160 },
            ],
            submitText: 'Buat Nomor Antrian',
            onSubmit: 'event.preventDefault(); antrianPage.simpanBaru(this);',
        });
    },

    async simpanBaru(form) {
        const val = (n) => form.querySelector(`[name="${n}"]`)?.value?.trim() || '';
        const namaPelanggan = val('namaPelanggan');
        if (!namaPelanggan) return alert('Nama pelanggan wajib diisi.');
        const tipeLayanan = val('tipeLayanan') || 'dine-in';

        try {
            const rec = await db.buatAntrianBaru({
                namaPelanggan,
                tipeLayanan,
                kodePrefix: tipeLayanan === 'dine-in' ? 'A' : 'B',
                nomorMeja: val('nomorMeja') || (tipeLayanan === 'dine-in' ? 'Meja 01' : 'Takeaway'),
                loket: val('loket') || (tipeLayanan === 'dine-in' ? 'Barista 1' : 'Barista 2'),
                ringkasanPesanan: val('ringkasanPesanan') || 'Pesanan Walk-In',
                estimasiMenit: parseInt(val('estimasiMenit'), 10) || 5,
                telepon: val('telepon'),
                catatan: val('catatan'),
            });
            web.closeDrawer();
            await web.navigate('antrian');
            this.bukaTiket(rec.id);
        } catch (err) {
            alert('Gagal membuat antrian: ' + err.message);
        }
    },

    async bukaEdit(id) {
        const a = await db.find('antrian', x => x.id === id);
        if (!a) return alert('Antrian tidak ditemukan.');
        web.openDrawer({
            title: `Edit Antrian ${a.nomorAntrian}`,
            fields: [
                { type: 'hidden', name: 'id', value: a.id },
                { type: 'text', name: 'namaPelanggan', label: 'Nama Pelanggan', value: a.namaPelanggan, required: true, maxlength: 80 },
                { type: 'select', name: 'tipeLayanan', label: 'Tipe Layanan', value: a.tipeLayanan || 'dine-in', required: true,
                  options: [
                      { value: 'dine-in', label: 'Dine-In' },
                      { value: 'takeaway', label: 'Takeaway' },
                      { value: 'delivery', label: 'Delivery' },
                  ] },
                { type: 'text', name: 'nomorMeja', label: 'Nomor Meja', value: a.nomorMeja || '', maxlength: 30 },
                { type: 'select', name: 'loket', label: 'Counter / Barista', value: a.loket || 'Barista 1',
                  options: ['Barista 1', 'Barista 2', 'Kasir & Kitchen'] },
                { type: 'text', name: 'ringkasanPesanan', label: 'Ringkasan Pesanan', value: a.ringkasanPesanan || '', maxlength: 200 },
                { type: 'number', name: 'estimasiMenit', label: 'Estimasi (Menit)', value: a.estimasiMenit || 5 },
                { type: 'textarea', name: 'catatan', label: 'Catatan Barista', value: a.catatan || '', rows: 2, maxlength: 160 },
            ],
            submitText: 'Simpan Perubahan',
            onSubmit: 'event.preventDefault(); antrianPage.simpanEdit(this);',
        });
    },

    async simpanEdit(form) {
        const val = (n) => form.querySelector(`[name="${n}"]`)?.value?.trim() || '';
        const id = val('id');
        try {
            await db.update('antrian', id, {
                namaPelanggan: val('namaPelanggan'),
                tipeLayanan: val('tipeLayanan'),
                nomorMeja: val('nomorMeja'),
                loket: val('loket'),
                ringkasanPesanan: val('ringkasanPesanan'),
                estimasiMenit: parseInt(val('estimasiMenit'), 10) || 5,
                catatan: val('catatan'),
            });
            web.closeDrawer();
            web.navigate('antrian');
        } catch (err) {
            alert('Gagal menyimpan: ' + err.message);
        }
    },

    /** Tampilkan struk/tiket nomor antrian siap cetak di dalam drawer. */
    async bukaTiket(id) {
        const a = await db.find('antrian', x => x.id === id);
        if (!a) return alert('Tiket antrian tidak ditemukan.');
        const user = auth.currentUser();
        const namaCaffe = user?.tenantNama || 'Kopi Piawai Caffe';
        const jamAmbil = a.waktuAmbil ? new Date(a.waktuAmbil).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';

        web.openDrawer({
            title: `Tiket Antrian ${a.nomorAntrian}`,
            bodyHtml: `
                <div class="queue-ticket-card" id="printableTicket">
                    <div class="queue-ticket-header">
                        <strong>${escHtml(namaCaffe)}</strong>
                        <span>Tiket Antrian Pesanan Caffe</span>
                    </div>
                    <div class="queue-ticket-number">${escHtml(a.nomorAntrian)}</div>
                    <div class="queue-ticket-badge">${escHtml((a.tipeLayanan || 'dine-in').toUpperCase())} &bull; ${escHtml(a.nomorMeja || '-')}</div>
                    <div class="queue-ticket-meta">
                        <div><span>Pelanggan:</span> <strong>${escHtml(a.namaPelanggan)}</strong></div>
                        <div><span>Counter:</span> <strong>${escHtml(a.loket || 'Barista 1')}</strong></div>
                        <div><span>Waktu Ambil:</span> <strong>${escHtml(a.tanggal)} ${escHtml(jamAmbil)}</strong></div>
                        <div><span>Est. Sajian:</span> <strong>&plusmn; ${Number(a.estimasiMenit) || 5} menit</strong></div>
                    </div>
                    <div class="queue-ticket-items">
                        <strong>Pesanan:</strong>
                        <p>${escHtml(a.ringkasanPesanan || '-')}</p>
                        ${a.catatan ? `<small>Catatan: ${escHtml(a.catatan)}</small>` : ''}
                    </div>
                    <div class="queue-ticket-footer">
                        Mohon menunggu panggilan nomor antrian Anda di layar monitor caffe. Terima kasih! &#9749;
                    </div>
                </div>
                <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
                    <button type="button" class="slcBtn" onclick="window.print()">&#128424; Cetak Tiket</button>
                    <button type="button" class="slcBtn" style="background:#1D9E75" onclick='antrianPage.panggil(${JSON.stringify(a.id)}); web.closeDrawer();'>&#128266; Panggil Sekarang</button>
                    ${a.transaksiId ? `<button type="button" class="slcBtn" style="background:#555" onclick='web.closeDrawer(); web.navigate(${JSON.stringify('transaksi/detail-' + a.transaksiId)})'>Lihat Struk POS</button>` : ''}
                </div>`,
        });
    },

    async hapus(id) {
        if (!confirm('Hapus baris antrian ini?')) return;
        try { await db.remove('antrian', id); } catch (err) { return alert('Gagal menghapus: ' + err.message); }
        web.navigate('antrian');
    },

    async resetDemo() {
        if (!confirm('Muat ulang data antrian & transaksi demo Caffe ke kondisi awal?')) return;
        db.resetDemoData();
        web.navigate('antrian');
    },
};

function formatJam(iso) {
    if (!iso) return '-';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return '-'; }
}

function hitungSelisihMenit(isoMulai, isoAkhir) {
    if (!isoMulai || !isoAkhir) return null;
    const a = new Date(isoMulai).getTime();
    const b = new Date(isoAkhir).getTime();
    if (isNaN(a) || isNaN(b) || b < a) return null;
    return Math.round(((b - a) / 60000) * 10) / 10;
}

async function resolveAntrian() {
    const guard = requireLogin(['owner', 'kasir', 'gudang']);
    if (guard) return guard;

    const today = new Date().toISOString().slice(0, 10);
    const semuaAntrian = await db.query('antrian', () => true);
    const hariIni = semuaAntrian
        .filter(a => a.tanggal === today)
        .sort((a, b) => (a.waktuAmbil || '').localeCompare(b.waktuAmbil || ''));

    const menunggu = hariIni.filter(a => a.status === 'menunggu');
    const dipanggil = hariIni.filter(a => a.status === 'dipanggil');
    const diproses = hariIni.filter(a => a.status === 'diproses');
    const siap = hariIni.filter(a => a.status === 'siap');
    const selesai = hariIni.filter(a => a.status === 'selesai');

    // Hitung Rata-rata Waktu Tunggu (Wq: waktuAmbil -> waktuPanggil) & Waktu Layanan Total (Ws: waktuAmbil -> waktuSelesai/waktuSiap)
    const sampelTunggu = hariIni.map(a => hitungSelisihMenit(a.waktuAmbil, a.waktuPanggil)).filter(v => v !== null);
    const avgWait = sampelTunggu.length
        ? (sampelTunggu.reduce((s, v) => s + v, 0) / sampelTunggu.length).toFixed(1)
        : '0.0';

    const sampelLayanan = hariIni.map(a => hitungSelisihMenit(a.waktuAmbil, a.waktuSiap || a.waktuSelesai)).filter(v => v !== null);
    const avgTurnaround = sampelLayanan.length
        ? (sampelLayanan.reduce((s, v) => s + v, 0) / sampelLayanan.length).toFixed(1)
        : '0.0';

    const sedangAktif = dipanggil[dipanggil.length - 1] || siap[siap.length - 1] || diproses[0] || menunggu[0] || null;

    // Saring baris tabel sesuai chip filter
    const filteredRows = hariIni.filter(a => {
        if (antrianPage.filterLoket && a.loket !== antrianPage.filterLoket) return false;
        if (antrianPage.filterStatus === 'aktif') return ['menunggu', 'dipanggil', 'diproses', 'siap'].includes(a.status);
        if (antrianPage.filterStatus === 'semua') return true;
        return a.status === antrianPage.filterStatus;
    });

    const tableRows = filteredRows.map(a => {
        const st = STATUS_ANTRIAN_BADGE[a.status] || { cls: '', label: a.status };
        const tungguMnt = hitungSelisihMenit(a.waktuAmbil, a.waktuPanggil || new Date().toISOString());
        return {
            'No. Antrian': `<strong class="queue-num-cell">${escHtml(a.nomorAntrian)}</strong>`,
            Pelanggan: `<strong>${escHtml(a.namaPelanggan)}</strong><br><small style="color:#666">${escHtml((a.tipeLayanan || 'dine-in').toUpperCase())} &middot; ${escHtml(a.nomorMeja || '-')}</small>`,
            Pesanan: `${escHtml(a.ringkasanPesanan || '-')}${a.catatan ? `<br><small style="color:#b45309"><em>Catatan: ${escHtml(a.catatan)}</em></small>` : ''}`,
            Barista: escHtml(a.loket || 'Barista 1'),
            Waktu: `<small>Ambil: ${escHtml(formatJam(a.waktuAmbil))}<br>Panggil: ${escHtml(formatJam(a.waktuPanggil))}${tungguMnt !== null ? ` (${tungguMnt} mnt)` : ''}</small>`,
            Status: `<span class="badge ${st.cls}">${escHtml(st.label)}</span>`,
            Aksi: `<div class="queue-action-btns">
                <button type="button" class="slcBtn" title="Panggil Suara" onclick='antrianPage.panggil(${JSON.stringify(a.id)})'>&#128266; Panggil</button>
                ${a.status === 'menunggu' || a.status === 'dipanggil'
                    ? `<button type="button" class="slcBtn" style="background:#d97706" onclick='antrianPage.ubahStatus(${JSON.stringify(a.id)},"diproses")'>&#9749; Racik</button>`
                    : ''}
                ${a.status === 'dipanggil' || a.status === 'diproses'
                    ? `<button type="button" class="slcBtn" style="background:#1D9E75" onclick='antrianPage.ubahStatus(${JSON.stringify(a.id)},"siap")'>&#128276; Siap</button>`
                    : ''}
                ${a.status !== 'selesai' && a.status !== 'batal'
                    ? `<button type="button" class="slcBtn" style="background:#2c3e50" onclick='antrianPage.ubahStatus(${JSON.stringify(a.id)},"selesai")'>&#10003; Selesai</button>`
                    : ''}
                <button type="button" class="slcBtn" style="background:#555" onclick='antrianPage.bukaTiket(${JSON.stringify(a.id)})'>&#127915; Tiket</button>
                <button type="button" class="slcBtn" style="background:#555" onclick='antrianPage.bukaEdit(${JSON.stringify(a.id)})'>Edit</button>
            </div>`,
        };
    });

    const filterChips = [
        { key: 'aktif', label: `Antrian Aktif (${menunggu.length + dipanggil.length + diproses.length + siap.length})` },
        { key: 'menunggu', label: `Menunggu (${menunggu.length})` },
        { key: 'dipanggil', label: `Dipanggil (${dipanggil.length})` },
        { key: 'diproses', label: `Diracik Barista (${diproses.length})` },
        { key: 'siap', label: `Siap Diambil (${siap.length})` },
        { key: 'selesai', label: `Selesai (${selesai.length})` },
        { key: 'semua', label: `Semua Hari Ini (${hariIni.length})` },
    ].map(c => `<button type="button" class="catcart-chip ${antrianPage.filterStatus === c.key ? 'active' : ''}" onclick='antrianPage.setFilter(${JSON.stringify(c.key)})'>${escHtml(c.label)}</button>`).join('');

    const loketChips = ['', 'Barista 1', 'Barista 2', 'Kasir & Kitchen'].map(l =>
        `<button type="button" class="catcart-chip ${antrianPage.filterLoket === l ? 'active' : ''}" onclick='antrianPage.setLoket(${JSON.stringify(l)})'>${escHtml(l || 'Semua Loket')}</button>`
    ).join('');

    const panelKontrolHtml = `
        <div class="queue-control-banner">
            <div class="queue-control-current">
                <span class="queue-control-label">NOMOR ANTRIAN AKTIF / DIPANGGIL</span>
                <div class="queue-control-big">${sedangAktif ? escHtml(sedangAktif.nomorAntrian) : '&mdash;'}</div>
                <div class="queue-control-sub">
                    ${sedangAktif
                        ? `<strong>${escHtml(sedangAktif.namaPelanggan)}</strong> &bull; ${escHtml(sedangAktif.nomorMeja || '-')} &bull; <span class="badge">${escHtml(sedangAktif.loket || 'Barista 1')}</span><br>
                           <small>${escHtml(sedangAktif.ringkasanPesanan || '-')}</small>`
                        : 'Belum ada antrian yang sedang dipanggil.'}
                </div>
            </div>
            <div class="queue-control-actions">
                <button type="button" class="slcBtn queue-btn-hero" onclick="antrianPage.panggilBerikutnya()">
                    &#128266; Panggil Antrian Berikutnya (${menunggu.length} Menunggu)
                </button>
                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
                    <button type="button" class="slcBtn" onclick="antrianPage.bukaTambah()">+ Ambil Antrian Baru</button>
                    <button type="button" class="slcBtn" style="background:#1D9E75" onclick="web.navigate('kasir')">&#9749; Kasir + Antrian</button>
                    <button type="button" class="slcBtn" style="background:#004761" onclick="web.navigate('layar-antrian')">&#128250; Buka Layar TV Antrian</button>
                    <button type="button" class="slcBtn" style="background:#555" onclick="antrianPage.toggleSuara()">
                        ${antrianPage.suaraAktif ? '&#128266; Suara TTS: ON' : '&#128263; Suara TTS: OFF'}
                    </button>
                </div>
            </div>
        </div>`;

    return [
        {
            section: 'titleHero',
            title: 'Antrian & Panggilan Barista Caffe',
            description: `Kelola antrian pesanan kopi & makanan secara real-time, panggil pelanggan dengan suara otomatis (TTS Bahasa Indonesia), dan pantau waktu layanan barista.`,
        },
        {
            section: 'statGrid',
            stats: [
                { value: menunggu.length, label: 'Antrian Menunggu' },
                { value: dipanggil.length + diproses.length, label: 'Sedang Dipanggil / Diracik' },
                { value: siap.length, label: 'Siap Diambil / Disajikan' },
                { value: selesai.length, label: 'Selesai Hari Ini' },
                { value: `${avgWait} mnt`, label: 'Rata-rata Waktu Tunggu (Wq)' },
                { value: `${avgTurnaround} mnt`, label: 'Rata-rata Total Layanan (Ws)' },
            ],
        },
        {
            section: 'articleFull',
            subtitle: 'Panel Kontrol Panggilan Barista & Kasir',
            lines: [
                panelKontrolHtml,
                `<div class="catcart-toolbar" style="position:static">
                    <div style="margin-bottom:8px"><strong>Filter Status:</strong></div>
                    <div class="catcart-chips" style="margin-bottom:10px">${filterChips}</div>
                    <div style="margin-bottom:8px"><strong>Filter Loket Barista:</strong></div>
                    <div class="catcart-chips">${loketChips}</div>
                </div>`,
                `table:${JSON.stringify(tableRows)}`,
                `<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
                    <button type="button" class="slcBtn" style="background:#555" onclick="web.navigate('simulasi')">&#128202; Analisis & Simulasi Antrian (M/M/c)</button>
                    <button type="button" class="slcBtn" style="background:#7f8c8d" onclick="antrianPage.resetDemo()">&#8635; Reset Data Demo Caffe</button>
                </div>`,
            ],
            tableOpts: { rawKeys: ['No. Antrian', 'Pelanggan', 'Pesanan', 'Waktu', 'Status', 'Aksi'] },
            emptyText: 'Tidak ada antrian pada filter ini. Klik "+ Ambil Antrian Baru" atau buat pesanan dari menu Kasir.',
        },
    ];
}
