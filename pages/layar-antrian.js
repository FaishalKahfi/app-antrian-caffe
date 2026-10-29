// ============================================================
// pages/layar-antrian.js — Layar Monitor TV Antrian Caffe Publik &
// Kiosk Ambil Antrian Mandiri (Self-Service Queue Display).
// Dapat diakses publik tanpa login (?layar-antrian atau ?layar-antrian/<slug>)
// maupun oleh staf caffe yang sedang login.
// ============================================================
web.routes['layar-antrian'] = 'resolveLayarAntrian';

const layarAntrianPage = {
    tokoKey: '',
    autoRefreshTimer: null,
    kataKunci: '',
    lastData: null,

    startAutoRefresh(tokoKey) {
        this.stopAutoRefresh();
        this.tokoKey = tokoKey || '';
        this.autoRefreshTimer = setInterval(async () => {
            const path = window.location.search.substring(1) || '';
            if (!path.startsWith('layar-antrian')) {
                this.stopAutoRefresh();
                return;
            }
            await this.segarkanTanpaKedip();
        }, 6000);
    },

    stopAutoRefresh() {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = null;
        }
    },

    async segarkanTanpaKedip() {
        const boardEl = web.gebi('tvQueueBoardWrap');
        if (!boardEl) return;
        try {
            const data = await db.publicAntrianStatus(this.tokoKey);
            this.lastData = data;
            boardEl.innerHTML = this.renderBoardHtml(data);
        } catch (e) {}
    },

    cari(kw) {
        this.kataKunci = String(kw || '').trim().toLowerCase();
        const boardEl = web.gebi('tvQueueBoardWrap');
        if (boardEl && this.lastData) {
            boardEl.innerHTML = this.renderBoardHtml(this.lastData);
        }
    },

    toggleFullscreen() {
        const elem = document.documentElement;
        if (!document.fullscreenElement) {
            elem.requestFullscreen?.().catch(() => {});
        } else {
            document.exitFullscreen?.().catch(() => {});
        }
    },

    bukaAmbilMandiri() {
        web.openDrawer({
            title: 'Ambil Nomor Antrian Mandiri (Self-Service)',
            fields: [
                { type: 'text', name: 'namaPelanggan', label: 'Nama Anda', placeholder: 'mis. Kak Rina', required: true, maxlength: 80 },
                { type: 'select', name: 'tipeLayanan', label: 'Jenis Layanan', value: 'dine-in', required: true,
                  options: [
                      { value: 'dine-in', label: 'Dine-In (Minum/Makan di Caffe — Kode A)' },
                      { value: 'takeaway', label: 'Takeaway (Bawa Pulang — Kode B)' },
                  ] },
                { type: 'text', name: 'nomorMeja', label: 'Nomor Meja (Jika Dine-In)', value: 'Meja 01', placeholder: 'mis. Meja 03 atau Takeaway', maxlength: 30 },
                { type: 'text', name: 'telepon', label: 'No. WhatsApp (Opsional)', placeholder: '08xxxxxxxxxx', maxlength: 30 },
                { type: 'textarea', name: 'catatan', label: 'Catatan / Request Khusus (Opsional)', placeholder: 'mis. Kursi dekat jendela / Less sugar', rows: 2, maxlength: 160 },
            ],
            submitText: 'Ambil Tiket Antrian Sekarang',
            onSubmit: 'event.preventDefault(); layarAntrianPage.kirimAmbilMandiri(this);',
        });
    },

    async kirimAmbilMandiri(form) {
        const val = (n) => form.querySelector(`[name="${n}"]`)?.value?.trim() || '';
        const namaPelanggan = val('namaPelanggan');
        if (!namaPelanggan) return alert('Mohon isi nama Anda terlebih dahulu.');
        const tipeLayanan = val('tipeLayanan') || 'dine-in';

        try {
            const tiket = await db.publicAntrianAmbil({
                toko: this.tokoKey,
                namaPelanggan,
                tipeLayanan,
                nomorMeja: val('nomorMeja') || (tipeLayanan === 'dine-in' ? 'Meja Umum' : 'Takeaway'),
                telepon: val('telepon'),
                catatan: val('catatan'),
                ringkasanPesanan: 'Ambil Antrian Mandiri (Kiosk)',
            });
            await this.segarkanTanpaKedip();
            web.openDrawer({
                title: `Tiket Antrian Anda: ${tiket.nomorAntrian}`,
                bodyHtml: `
                    <div class="queue-ticket-card">
                        <div class="queue-ticket-header">
                            <strong>${escHtml(this.lastData?.tenant?.nama || 'Kopi Piawai Caffe')}</strong>
                            <span>Tiket Antrian Mandiri</span>
                        </div>
                        <div class="queue-ticket-number">${escHtml(tiket.nomorAntrian)}</div>
                        <div class="queue-ticket-badge">${escHtml((tiket.tipeLayanan || 'dine-in').toUpperCase())} &bull; ${escHtml(tiket.nomorMeja || '-')}</div>
                        <div class="queue-ticket-meta">
                            <div><span>Nama:</span> <strong>${escHtml(tiket.namaPelanggan)}</strong></div>
                            <div><span>Counter:</span> <strong>${escHtml(tiket.loket || 'Barista 1')}</strong></div>
                            <div><span>Estimasi Tunggu:</span> <strong>&plusmn; ${Number(tiket.estimasiMenit) || 5} menit</strong></div>
                        </div>
                        <div class="queue-ticket-footer">
                            Silakan pantau nomor antrian <strong>${escHtml(tiket.nomorAntrian)}</strong> di layar monitor atau lanjutkan memilih menu kopi favorit Anda.
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
                        <button type="button" class="slcBtn" onclick="window.print()">&#128424; Cetak / Simpan PDF</button>
                        <button type="button" class="slcBtn" style="background:#1D9E75" onclick="web.closeDrawer(); web.navigate('toko/${escHtml(this.lastData?.tenant?.slug || 'kopi-piawai')}')">&#9749; Sekalian Pesan Menu Online</button>
                    </div>`,
            });
        } catch (err) {
            alert('Gagal mengambil tiket antrian: ' + err.message);
        }
    },

    renderBoardHtml(data) {
        const list = (data?.antrian || []).filter(a => {
            if (!this.kataKunci) return true;
            return (
                String(a.nomorAntrian || '').toLowerCase().includes(this.kataKunci) ||
                String(a.namaPelanggan || '').toLowerCase().includes(this.kataKunci) ||
                String(a.nomorMeja || '').toLowerCase().includes(this.kataKunci)
            );
        });

        const dipanggil = list.filter(a => a.status === 'dipanggil');
        const siap = list.filter(a => a.status === 'siap');
        const diproses = list.filter(a => a.status === 'diproses');
        const menunggu = list.filter(a => a.status === 'menunggu');

        const utamaDipanggil = dipanggil[dipanggil.length - 1] || null;
        const utamaSiap = siap[siap.length - 1] || null;

        const renderQueueCard = (a, highlightCls = '') => `
            <div class="tv-queue-item ${highlightCls}">
                <div class="tv-queue-item-left">
                    <span class="tv-queue-code">${escHtml(a.nomorAntrian)}</span>
                    <span class="tv-queue-service">${escHtml((a.tipeLayanan || 'dine-in').toUpperCase())} &bull; ${escHtml(a.nomorMeja || '-')}</span>
                </div>
                <div class="tv-queue-item-right">
                    <strong>${escHtml(a.namaPelanggan)}</strong>
                    <small>${escHtml(a.loket || 'Barista 1')} &bull; Est. ${Number(a.estimasiMenit) || 5} mnt</small>
                    ${a.ringkasanPesanan ? `<span class="tv-queue-menu">${escHtml(a.ringkasanPesanan)}</span>` : ''}
                </div>
            </div>`;

        return `
            <div class="tv-hero-grid">
                <div class="tv-hero-box tv-hero-calling">
                    <div class="tv-hero-tag">&#128266; SEDANG DIPANGGIL KE COUNTER</div>
                    <div class="tv-hero-number">${utamaDipanggil ? escHtml(utamaDipanggil.nomorAntrian) : '&mdash;'}</div>
                    <div class="tv-hero-customer">
                        ${utamaDipanggil
                            ? `<strong>${escHtml(utamaDipanggil.namaPelanggan)}</strong><br>
                               <span>Silakan menuju <strong>${escHtml(utamaDipanggil.loket || 'Barista 1')}</strong> (${escHtml(utamaDipanggil.nomorMeja || '-')})</span>`
                            : 'Menunggu panggilan berikutnya...'}
                    </div>
                </div>
                <div class="tv-hero-box tv-hero-ready">
                    <div class="tv-hero-tag">&#128276; PESANAN SIAP DIAMBIL / DISAJIKAN</div>
                    <div class="tv-hero-number">${utamaSiap ? escHtml(utamaSiap.nomorAntrian) : '&mdash;'}</div>
                    <div class="tv-hero-customer">
                        ${utamaSiap
                            ? `<strong>${escHtml(utamaSiap.namaPelanggan)}</strong> &bull; ${escHtml(utamaSiap.nomorMeja || '-')}<br>
                               <span>${escHtml(utamaSiap.ringkasanPesanan || 'Pesanan siap disajikan')}</span>`
                            : 'Belum ada pesanan di meja pickup'}
                    </div>
                </div>
            </div>

            <div class="tv-columns-grid">
                <div class="tv-column">
                    <div class="tv-column-header tv-col-ready">
                        <span>&#9989; SIAP DIAMBIL (${siap.length})</span>
                    </div>
                    <div class="tv-column-body">
                        ${siap.length ? siap.map(a => renderQueueCard(a, 'tv-item-ready')).join('') : '<div class="tv-empty">Belum ada pesanan siap diambil.</div>'}
                    </div>
                </div>

                <div class="tv-column">
                    <div class="tv-column-header tv-col-process">
                        <span>&#9749; SEDANG DIRACIK BARISTA (${dipanggil.length + diproses.length})</span>
                    </div>
                    <div class="tv-column-body">
                        ${(dipanggil.length + diproses.length)
                            ? [...dipanggil, ...diproses].map(a => renderQueueCard(a, 'tv-item-process')).join('')
                            : '<div class="tv-empty">Tidak ada pesanan yang sedang diracik.</div>'}
                    </div>
                </div>

                <div class="tv-column">
                    <div class="tv-column-header tv-col-wait">
                        <span>&#9203; ANTRIAN MENUNGGU (${menunggu.length})</span>
                    </div>
                    <div class="tv-column-body">
                        ${menunggu.length ? menunggu.map(a => renderQueueCard(a, 'tv-item-wait')).join('') : '<div class="tv-empty">Antrian kosong — pesanan Anda akan langsung diproses!</div>'}
                    </div>
                </div>
            </div>`;
    },
};

async function resolveLayarAntrian(sub) {
    const user = auth.currentUser();
    const tokoKey = sub || user?.tenantSlug || user?.tenantId || 'kopi-piawai';

    let data;
    try {
        data = await db.publicAntrianStatus(tokoKey);
    } catch (err) {
        return [{ section: 'titleHero', title: 'Layar Antrian Tidak Tersedia', description: escHtml(err.message) }];
    }

    layarAntrianPage.lastData = data;
    layarAntrianPage.kataKunci = '';
    layarAntrianPage.startAutoRefresh(tokoKey);

    const tenant = data.tenant || { nama: 'Kopi Piawai Caffe', alamat: '' };

    return [
        {
            section: 'titleHero',
            title: `Monitor Antrian — ${escHtml(tenant.nama)}`,
            description: `${escHtml(tenant.alamat || 'Layar informasi status pesanan & antrian caffe real-time')} &middot; Tanggal: <strong>${escHtml(data.tanggal)}</strong>`,
        },
        {
            section: 'articleFull',
            lines: [
                `<div class="tv-toolbar">
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button type="button" class="slcBtn" onclick="layarAntrianPage.bukaAmbilMandiri()">+ Ambil Nomor Antrian Mandiri</button>
                        <button type="button" class="slcBtn" style="background:#1D9E75" onclick='web.navigate(${JSON.stringify('toko/' + (tenant.slug || 'kopi-piawai'))})'>&#9749; Pesan Menu & Ambil Antrian</button>
                        <button type="button" class="slcBtn" style="background:#004761" onclick="layarAntrianPage.toggleFullscreen()">&#128250; Mode Layar Penuh (TV)</button>
                        ${user ? `<button type="button" class="slcBtn" style="background:#555" onclick="web.navigate('antrian')">&#127908; Panel Panggilan Barista</button>` : ''}
                    </div>
                    <div style="min-width:220px;flex:1;max-width:340px">
                        <input type="search" placeholder="Cari nomor antrian / nama Anda..." oninput="layarAntrianPage.cari(this.value)" style="margin:0">
                    </div>
                </div>`,
                `<div id="tvQueueBoardWrap">${layarAntrianPage.renderBoardHtml(data)}</div>`,
            ],
        },
    ];
}
