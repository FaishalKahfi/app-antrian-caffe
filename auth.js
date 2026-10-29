// ============================================================
// auth.js — Login berbasis "Kode Caffe / Toko" (tenant) + username/password.
// VERSI TER-HARDENING — pola `piawai-app` (lihat SECURITY.md).
// ============================================================

function mathCaptchaFieldsHtml(challenge, token) {
    const safeChallenge = /^\d{1,2} \+ \d{1,2} = \?$/.test(challenge) ? challenge : 'Soal captcha tidak valid';
    return `<input type="hidden" class="js-captcha-token" name="captchaToken" value="${escHtml(token || '')}">
        <div class="a-row">
            <label class="a-label">Captcha: ${escHtml(safeChallenge)}</label>
            <input type="number" class="js-captcha-answer" name="captchaAnswer" placeholder="Jawaban" required autocomplete="off">
        </div>`;
}

async function renderMathCaptcha(form) {
    const slot = form.querySelector('.js-captcha-slot');
    if (!slot) return;
    try {
        const { challenge, token } = await db.getCaptcha();
        slot.innerHTML = mathCaptchaFieldsHtml(challenge, token);
    } catch (e) {
        slot.innerHTML = `<div class="a-row"><span style="color:#c0392b">Gagal memuat captcha: ${escHtml(e.message)}</span></div>`;
    }
}

async function initialCaptchaFieldHtml() {
    try {
        const { challenge, token } = await db.getCaptcha();
        return `<div class="js-captcha-slot">${mathCaptchaFieldsHtml(challenge, token)}</div>`;
    } catch (e) {
        return `<div class="js-captcha-slot"><div class="a-row"><span style="color:#c0392b">Gagal memuat captcha: ${escHtml(e.message)}</span></div></div>`;
    }
}

function readCaptcha(form) {
    return {
        captchaToken: form.querySelector('.js-captcha-token')?.value || '',
        captchaAnswer: form.querySelector('.js-captcha-answer')?.value || '',
    };
}

const auth = {
    SESSION_KEY: 'posSession',
    TOKEN_KEY: 'posToken',
    SUPERADMIN_KODE: 'SUPERADMIN',

    LOGIN_LOCKOUT_KEY: 'posLoginAttempts',
    LOGIN_MAX_ATTEMPTS: 5,
    LOGIN_LOCKOUT_MS: 60_000,

    _loginAttemptState() {
        try { return JSON.parse(sessionStorage.getItem(this.LOGIN_LOCKOUT_KEY) || 'null') || { count: 0, until: 0 }; }
        catch (e) { return { count: 0, until: 0 }; }
    },
    _recordLoginFailure() {
        const s = this._loginAttemptState();
        s.count += 1;
        if (s.count >= this.LOGIN_MAX_ATTEMPTS) { s.until = Date.now() + this.LOGIN_LOCKOUT_MS; s.count = 0; }
        try { sessionStorage.setItem(this.LOGIN_LOCKOUT_KEY, JSON.stringify(s)); } catch (e) {}
    },
    _clearLoginFailures() {
        try { sessionStorage.removeItem(this.LOGIN_LOCKOUT_KEY); } catch (e) {}
    },
    _lockoutRemainingMs() {
        const s = this._loginAttemptState();
        return Math.max(0, s.until - Date.now());
    },

    token() {
        try { return localStorage.getItem(this.TOKEN_KEY) || null; } catch (e) { return null; }
    },

    _saveSession(res) {
        localStorage.setItem(this.TOKEN_KEY, res.token);
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(res.user));
    },

    currentUser() {
        try { return JSON.parse(localStorage.getItem(this.SESSION_KEY) || 'null'); }
        catch (e) { return null; }
    },

    isLoggedIn() { return !!this.currentUser(); },
    isSuperadmin() { return this.currentUser()?.role === 'superadmin'; },

    async login(kodeToko, username, password, captcha) {
        const kode = String(kodeToko || '').trim().toUpperCase();
        if (!kode || !username || !password) return 'Kode Caffe/Toko, username, dan password wajib diisi.';
        try {
            const res = await db.login({ kodeToko: kode, username, password, ...captcha });
            this._saveSession(res);
            return null;
        } catch (e) {
            return e.message;
        }
    },

    /** Masuk cepat untuk pengujian demo peran Caffe (Owner / Kasir / Barista). */
    async demoLogin(kodeToko, username, password) {
        db.setLocalMode(true);
        const cap = await db.getCaptcha();
        const ans = String(cap.token || '').replace('local_cap_', '');
        const err = await this.login(kodeToko, username, password, { captchaToken: cap.token, captchaAnswer: ans });
        if (err) { alert(err); return; }
        this._clearLoginFailures();
        if (typeof renderMenu === 'function') renderMenu();
        web.navigate(this.isSuperadmin() ? 'tenant' : 'antrian');
    },

    async register({ kodeToko, namaToko, alamat, telepon, ownerName, username, password, captchaToken, captchaAnswer }) {
        const kode = String(kodeToko || '').trim().toUpperCase();
        if (!kode || !namaToko || !ownerName || !username || !password) return 'Semua field bertanda * wajib diisi.';
        if (kode === this.SUPERADMIN_KODE) return 'Kode tersebut tidak dapat dipakai.';
        if (password.length < 8) return 'Password minimal 8 karakter.';
        try {
            const res = await db.register({ kodeToko: kode, namaToko, alamat: alamat || '', telepon: telepon || '', ownerName, username, password, captchaToken, captchaAnswer });
            this._saveSession(res);
            return null;
        } catch (e) {
            return e.message;
        }
    },

    logout() {
        localStorage.removeItem(this.SESSION_KEY);
        localStorage.removeItem(this.TOKEN_KEY);
        if (typeof renderMenu === 'function') renderMenu();
        web.navigate('login');
    },

    renderAuthUI() {
        const slot = web.gebi('authSlot');
        if (!slot) return;
        const user = this.currentUser();
        slot.innerHTML = user
            ? `<span class="auth-chip">
                   <i class="di-person img-24"></i>
                   <span class="auth-name">${escHtml(user.name)}${user.role !== 'superadmin' ? ' &middot; ' + escHtml(user.tenantNama || '') : ''}</span>
                   <span class="badge auth-role">${escHtml(roleLabel(user.role))}</span>
               </span>
               <button class="slcBtn auth-logout" onclick="auth.logout()">Keluar</button>`
            : `<a href="javascript:void(0)" onclick="web.navigate('login')" class="auth-chip">
                   <i class="di-lock img-24"></i>
                   <span class="auth-name">Masuk Staf</span>
               </a>`;
        if (typeof svg?.di === 'function') svg.di();
    },

    async handleLoginSubmit(form) {
        const remaining = this._lockoutRemainingMs();
        if (remaining > 0) {
            alert(`Terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil(remaining / 1000)} detik.`);
            return;
        }

        const captcha = readCaptcha(form);
        if (!captcha.captchaToken || !captcha.captchaAnswer) { alert('Mohon isi jawaban captcha terlebih dahulu.'); return; }

        const kodeToko = form.querySelector('[name="kodeToko"]').value;
        const username = form.querySelector('[name="username"]').value.trim();
        const password = form.querySelector('[name="password"]').value;

        const btn = form.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
        const err = await this.login(kodeToko, username, password, captcha).catch(e => e.message);
        if (btn) { btn.disabled = false; btn.textContent = 'Masuk'; }
        await renderMathCaptcha(form);

        if (err) { this._recordLoginFailure(); alert(err); return; }
        this._clearLoginFailures();
        if (typeof renderMenu === 'function') renderMenu();
        web.navigate(this.isSuperadmin() ? 'tenant' : 'antrian');
    },

    async handleRegisterSubmit(form) {
        const captcha = readCaptcha(form);
        if (!captcha.captchaToken || !captcha.captchaAnswer) { alert('Mohon isi jawaban captcha terlebih dahulu.'); return; }

        const val = (name) => form.querySelector(`[name="${name}"]`)?.value.trim() || '';
        const payload = {
            kodeToko: val('kodeToko'), namaToko: val('namaToko'), alamat: val('alamat'),
            telepon: val('telepon'), ownerName: val('ownerName'), username: val('username'),
            password: form.querySelector('[name="password"]').value,
            ...captcha,
        };
        const btn = form.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = 'Mendaftarkan...'; }
        const err = await this.register(payload).catch(e => e.message);
        if (btn) { btn.disabled = false; btn.textContent = 'Daftar & Mulai'; }
        await renderMathCaptcha(form);

        if (err) { alert(err); return; }
        alert(`Caffe "${payload.namaToko}" berhasil dibuat. Selamat datang!`);
        if (typeof renderMenu === 'function') renderMenu();
        web.navigate('antrian');
    },
};

function roleLabel(role) {
    return { superadmin: 'Superadmin', owner: 'Owner Caffe', kasir: 'Kasir & Barista', gudang: 'Head Barista / Gudang' }[role] || role;
}

function requireLogin(allowedRoles) {
    const user = auth.currentUser();
    if (!user) {
        return [{ section: 'titleHero', title: 'Perlu Masuk',
                   description: `Silakan <a href="javascript:void(0)" onclick="web.navigate(&#39;login&#39;)">masuk</a> terlebih dahulu untuk mengakses halaman manajemen caffe ini.` }];
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return [{ section: 'titleHero', title: 'Akses Ditolak',
                   description: 'Peran akun Anda tidak memiliki izin untuk membuka halaman ini.' }];
    }
    return null;
}

web.routes.login = 'resolveLogin';
web.resolveLogin = async function () {
    if (auth.isLoggedIn()) {
        return [{ section: 'titleHero', title: 'Anda Sudah Masuk',
                   description: `Masuk sebagai <strong>${escHtml(auth.currentUser().name)}</strong> (${escHtml(auth.currentUser().tenantNama || '')}).` }];
    }
    return [
        { section: 'titleHero', title: 'Masuk ke Caffe Anda', description: 'Masukkan Kode Caffe, username, dan password staf/owner.' },
        {
            section: 'articleFull',
            subtitle: 'Akses Cepat Demo Caffe (1-Klik)',
            lines: [
                `<div class="info-card">
                    <strong>Mode Demo & Simulasi Antrian Caffe (Kopi Piawai Caffe — CAFFE01)</strong>
                    <p>Gunakan tombol di bawah untuk langsung masuk dan menguji antrian caffe, panggilan suara barista, kasir POS, dan simulasi antrian:</p>
                    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
                        <button type="button" class="slcBtn" onclick="auth.demoLogin('CAFFE01','owner','owner123')">&#9749; Masuk sebagai Owner Caffe</button>
                        <button type="button" class="slcBtn" style="background:#1D9E75" onclick="auth.demoLogin('CAFFE01','kasir','kasir123')">&#127908; Masuk sebagai Kasir & Barista</button>
                        <button type="button" class="slcBtn" style="background:#555" onclick="auth.demoLogin('CAFFE01','barista','barista123')">&#128104;&zwj;&#127859; Masuk sebagai Head Barista</button>
                    </div>
                </div>`,
            ],
        },
        {
            section: 'articleFull',
            subtitle: 'Form Masuk Manual',
            fields: [
                { type: 'text', name: 'kodeToko', label: 'Kode Caffe / Toko', placeholder: 'mis. CAFFE01 atau TOKO001', value: 'CAFFE01', required: true, autocomplete: 'username' },
                { type: 'text', name: 'username', label: 'Username', placeholder: 'owner / kasir / barista', value: 'owner', required: true, autocomplete: 'username' },
                { type: 'password', name: 'password', label: 'Password', value: 'owner123', required: true, autocomplete: 'current-password' },
                { type: 'raw', html: await initialCaptchaFieldHtml() },
            ],
            submitText: 'Masuk',
            onSubmit: 'event.preventDefault(); auth.handleLoginSubmit(this);',
            lines: [
                'form:',
                'link:Belum punya akun Caffe? Daftarkan Caffe Baru di sini:register',
            ],
        },
    ];
};

web.routes.register = 'resolveRegister';
web.resolveRegister = async function () {
    if (auth.isLoggedIn()) return web.resolveLogin();
    return [
        { section: 'titleHero', title: 'Daftarkan Caffe Baru', description: 'Buat sistem antrian & POS untuk caffe Anda dalam satu langkah.' },
        {
            section: 'articleFull',
            subtitle: 'Form Registrasi Caffe',
            fields: [
                { type: 'text', name: 'kodeToko', label: 'Kode Caffe', placeholder: 'mis. CAFFE02', required: true },
                { type: 'text', name: 'namaToko', label: 'Nama Caffe', placeholder: 'mis. Kopi Kenangan Senja', required: true, maxlength: 80 },
                { type: 'text', name: 'alamat', label: 'Alamat Caffe', maxlength: 200 },
                { type: 'text', name: 'telepon', label: 'No. WhatsApp / Telepon', maxlength: 30 },
                { type: 'text', name: 'ownerName', label: 'Nama Pemilik (Owner)', required: true, maxlength: 80 },
                { type: 'text', name: 'username', label: 'Username Pemilik', required: true, autocomplete: 'username' },
                { type: 'password', name: 'password', label: 'Password (min. 8 karakter)', required: true, autocomplete: 'new-password' },
                { type: 'raw', html: await initialCaptchaFieldHtml() },
            ],
            submitText: 'Daftar & Mulai',
            onSubmit: 'event.preventDefault(); auth.handleRegisterSubmit(this);',
            lines: ['form:', 'link:Sudah punya akun? Masuk di sini:login'],
        },
    ];
};
