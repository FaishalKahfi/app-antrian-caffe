// ============================================================
// engine.js — Mesin render SPA modern untuk Caffe Piawai (Queue & POS).
// Mempertahankan kontrak API penuh (`web.routes`, `web.navigate`,
// `web.openDrawer`, `components`, `ui.render`, `escHtml`) dengan
// komponen UI modern, bersih, dan responsif.
// ============================================================

const web = {
    routes: {},

    gebi: (id) => document.getElementById(id),

    openDrawer: function (cfg) {
        const overlay = this.gebi('formDrawerOverlay');
        const panel   = this.gebi('formDrawerPanel');
        const titleEl = this.gebi('formDrawerTitle');
        const bodyEl  = this.gebi('formDrawerBody');
        if (!overlay || !panel || !bodyEl || !cfg) return;

        titleEl.textContent = cfg.title || cfg.subtitle || 'Form';
        bodyEl.innerHTML = cfg.bodyHtml !== undefined ? cfg.bodyHtml : components.genericForm(cfg);

        overlay.classList.add('open');
        panel.classList.add('open');
        document.body.classList.add('drawer-lock');
        if (typeof svg?.di === 'function') svg.di();
    },

    closeDrawer: function () {
        this.gebi('formDrawerOverlay')?.classList.remove('open');
        this.gebi('formDrawerPanel')?.classList.remove('open');
        document.body.classList.remove('drawer-lock');
    },

    openFormFromPage: function (cfg, opts = {}) {
        if (!cfg || !cfg.fields) { alert(opts.title || 'Tidak dapat membuka form'); return; }
        this.openDrawer({ ...cfg, title: opts.title || cfg.title || cfg.subtitle });
    },

    navigate: async function (slug) {
        this.closeDrawer();

        const mySeq = ++this._navSeq;
        web.startProgress();

        const queryString = window.location.search.substring(1);
        const currentPath = slug || queryString || 'home';
        const [targetSlug, subParam] = currentPath.split('/');

        let pageData = [];
        const resolverName = this.routes[targetSlug];
        const resolverFn = this[resolverName] || window[resolverName];

        try {
            if (typeof resolverFn === 'function') {
                pageData = await Promise.resolve(resolverFn.call(this, subParam, targetSlug));
            } else {
                pageData = this.resolveContent(targetSlug, subParam);
            }
        } catch (err) {
            console.error(err);
            pageData = [{ section: 'titleHero', title: 'Terjadi Kesalahan', description: escHtml(err.message) }];
        }

        if (mySeq !== this._navSeq) return false;

        await ui.render('content', pageData);
        web.finishProgress();

        if (slug !== undefined) {
            window.history.pushState({ path: currentPath }, '', `?${currentPath}`);
        }
        document.title = `Caffe Piawai — ${targetSlug.replace(/-/g, ' ').toUpperCase()}`;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (typeof svg?.di === 'function') svg.di();

        // Update active state di navbar
        document.querySelectorAll('#navLinks a[data-slug]').forEach(a => {
            a.classList.toggle('active', a.getAttribute('data-slug') === targetSlug);
        });
        document.querySelectorAll('#navLinks .nav-parent').forEach(parent => {
            const hasActiveChild = !!parent.querySelector(`a[data-slug="${targetSlug}"]`);
            parent.classList.toggle('active', hasActiveChild);
        });

        web.gebi('navLinks')?.classList.remove('active');
        document.querySelectorAll('.nav-parent.open').forEach(el => el.classList.remove('open'));
        return false;
    },

    _navSeq: 0,

    _progressTimer: null,
    startProgress: function () {
        const bar = this.gebi('navProgress');
        if (!bar) return;
        clearTimeout(this._progressTimer);
        bar.classList.remove('done');
        bar.style.transition = 'none';
        bar.style.width = '0%';
        void bar.offsetWidth;
        bar.style.transition = '';
        bar.classList.add('active');
        requestAnimationFrame(() => { bar.style.width = '80%'; });
    },
    finishProgress: function () {
        const bar = this.gebi('navProgress');
        if (!bar) return;
        bar.style.width = '100%';
        this._progressTimer = setTimeout(() => {
            bar.classList.remove('active');
            bar.classList.add('done');
        }, 150);
    },

    toggleSubmenu: function (labelEl) {
        const parent = labelEl.closest('.nav-parent');
        if (!parent) return;
        const wasOpen = parent.classList.contains('open');
        document.querySelectorAll('.nav-parent.open').forEach(el => el.classList.remove('open'));
        if (!wasOpen) parent.classList.add('open');
    },

    resolveContent: function (category, subId) {
        const fullData = pages[category] || pages['home'];
        if (!Array.isArray(fullData)) return fullData;

        if (subId) {
            const cleanId = subId.split('?')[0];
            const subContent = fullData.find(item => item.id === cleanId);
            if (subContent) return [subContent];
            return [{ section: 'titleHero', title: 'Konten Tidak Ditemukan',
                      description: `ID <strong>${escHtml(cleanId)}</strong> tidak tersedia.` }];
        }
        return fullData.filter(item => !item.id);
    },
};

function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

// ============================================================
// COMPONENTS — Komponen UI Modern & Clean
// ============================================================
const components = {

    lineRenderer: (lines = [], context = {}) => {
        const data = Array.isArray(lines) ? lines : [];
        let inCodeBlock = false;

        const handlers = {
            'form:': (val) => {
                if (val) {
                    try { const inlineCtx = JSON.parse(val); return components.genericForm(inlineCtx); }
                    catch (e) { return components.genericForm(context); }
                }
                return components.genericForm(context);
            },
            'link:': (val) => {
                const parts = val.split(':');
                return `<a href="javascript:void(0)" onclick="web.navigate('${escHtml(parts.slice(1).join(':'))}')" class="inline-link">
                    <span>${escHtml(parts[0])}</span>
                    <span class="inline-link-arrow">&rarr;</span>
                </a>`;
            },
            'skill:': (val) => {
                const [percent, label, text] = val.split(':');
                return `<div class="skill-item">
                    <div class="skill-info"><strong>${escHtml(label)}</strong> ${escHtml(text || '')} <small>(${escHtml(percent)})</small></div>
                    <div class="skill-track"><div class="skill-fill" style="width:${escHtml(percent)}"></div></div>
                </div>`;
            },
            'card:': (val) => {
                const idx = val.indexOf(':');
                const title = idx >= 0 ? val.slice(0, idx) : val;
                const content = idx >= 0 ? val.slice(idx + 1) : '';
                return `<div class="info-card">
                    <div class="info-card-label">${escHtml(title)}</div>
                    <div class="info-card-value">${escHtml(content)}</div>
                </div>`;
            },
            'table:': (val) => {
                let dataTable = null;
                if (val) {
                    if (context[val] && Array.isArray(context[val])) dataTable = context[val];
                    else { try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) dataTable = parsed; } catch (e) { return `<div class="info-card">⚠ Format tabel salah</div>`; } }
                }
                if (!dataTable?.length) return context.emptyText ? `<div class="empty-state-box">${context.emptyText}</div>` : '';
                return components.renderTable(dataTable, context.tableOpts || {});
            },
            'badge:': (val) => `<span class="badge">${escHtml(val)}</span>`,
            '### ': (val) => `<h3 class="section-h3">${escHtml(val)}</h3>`,
            '## ':  (val) => `<h2 class="section-h2">${escHtml(val)}</h2>`,
            '---':  () => '<hr class="modern-divider">',
        };

        const out = [];
        let cardBuffer = [];
        const flushCards = () => {
            if (!cardBuffer.length) return;
            out.push(`<div class="info-card-grid">${cardBuffer.join('')}</div>`);
            cardBuffer = [];
        };

        for (const raw of data) {
            const line = String(raw ?? '');
            if (line.startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
            if (inCodeBlock) { out.push(`<pre><code>${escHtml(line)}</code></pre>`); continue; }

            let matched = false;
            for (const [prefix, handler] of Object.entries(handlers)) {
                if (line.startsWith(prefix)) {
                    const rendered = handler(line.slice(prefix.length));
                    if (prefix === 'card:') { cardBuffer.push(rendered); }
                    else { flushCards(); out.push(rendered); }
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                flushCards();
                const trimmed = line.trim();
                if (!trimmed) continue;
                // Jika baris dimulai dengan tag blok HTML (<div, <form, <button, <table), jangan bungkus dengan <p>
                if (/^<(div|form|table|section|ul|ol|hr|h[1-6])/i.test(trimmed)) {
                    out.push(line);
                } else {
                    out.push(`<div class="line-block">${line}</div>`);
                }
            }
        }
        flushCards();
        return out.join('');
    },

    genericForm: (ctx) => {
        const fields = (ctx.fields || []).map(f => {
            if (f.type === 'raw') return f.html || '';

            const fid  = f.id ? `id="${escHtml(f.id)}"` : '';
            const fval = escHtml(f.value !== undefined && f.value !== null ? String(f.value) : '');
            const req  = f.required ? 'required' : '';
            const ph   = f.placeholder ? `placeholder="${escHtml(f.placeholder)}"` : '';
            const maxlen = f.maxlength ? `maxlength="${Number(f.maxlength)}"` : '';
            const fname = f.name ? `name="${escHtml(f.name)}"` : '';

            if (f.type === 'hidden') return `<input type="hidden" ${fid} ${fname} value="${fval}">`;

            const starMark = f.required ? ' <span class="req-star">*</span>' : '';
            const label = f.label ? `<label class="a-label">${escHtml(f.label)}${starMark}</label>` : '';

            let input;
            if (f.type === 'select') {
                const opts = (f.options || []).map(o => {
                    const v   = typeof o === 'object' ? o.value : o;
                    const l   = typeof o === 'object' ? o.label : o;
                    const sel = String(fval) === escHtml(String(v)) ? 'selected' : '';
                    return `<option value="${escHtml(v)}" ${sel}>${escHtml(l)}</option>`;
                }).join('');
                input = `<select ${fid} ${fname} ${req}><option value="">— Pilih —</option>${opts}</select>`;
            } else if (f.type === 'textarea') {
                input = `<textarea ${fid} ${fname} rows="${f.rows || 3}" ${ph} ${req} ${maxlen}>${fval}</textarea>`;
            } else {
                const step = f.type === 'number' ? `step="${f.step || 'any'}"` : '';
                input = `<input type="${f.type || 'text'}" ${fid} ${fname} value="${fval}" ${ph} ${req} ${step} ${maxlen}>`;
            }
            return `<div class="a-row">${label}${input}</div>`;
        }).join('');

        const onSubmit  = ctx.onSubmit || "event.preventDefault();";
        const submitBtn = ctx.noSubmitBtn ? '' : `<button type="submit" class="slcBtn btn-submit-full">${escHtml(ctx.submitText || 'Simpan')}</button>`;

        return `<form class="${ctx.wrapClass || 'dynamic-form'}" onsubmit="${onSubmit}">
            ${fields}
            ${submitBtn}
        </form>`;
    },

    titleHero: (d) => `
        <section class="modern-page-header">
            <div class="modern-page-header-inner">
                <div class="page-eyebrow">&#9749; Caffe Piawai Workspace</div>
                <h1 class="page-title">${d.title}</h1>
                ${d.description ? `<p class="page-desc">${d.description}</p>` : ''}
            </div>
        </section>`,

    hero: (d) => `
        <section class="modern-hero">
            <div class="modern-hero-content">
                <div class="hero-pill-row">
                    ${(d.badges || []).map(b => `<span class="hero-pill">${escHtml(b)}</span>`).join('')}
                </div>
                <h1 class="hero-heading">${d.title}</h1>
                ${d.tagline ? `<p class="hero-tagline">${d.tagline}</p>` : ''}
                ${d.description ? `<p class="hero-desc">${d.description}</p>` : ''}
                <div class="hero-cta-group">
                    ${d.cta ? `<a href="?${d.cta.link}" onclick="return web.navigate('${d.cta.link}')" class="btn-cta">${escHtml(d.cta.text)} &rarr;</a>` : ''}
                    <a href="?toko/kopi-piawai" onclick="return web.navigate('toko/kopi-piawai')" class="btn-cta-secondary">&#9749; Pesan Menu Online</a>
                </div>
            </div>
            <div class="modern-hero-visual">
                <div class="hero-preview-card">
                    <div class="hero-preview-top">
                        <span class="hero-live-dot"></span>
                        <span>LIVE MONITOR CAFFE</span>
                    </div>
                    <div class="hero-preview-num">A-003</div>
                    <div class="hero-preview-meta">Sedang Dipanggil &bull; Barista 1</div>
                    <div class="hero-preview-chips">
                        <span class="hero-mini-chip ready">&#10003; A-002 Siap</span>
                        <span class="hero-mini-chip brew">&#9749; B-002 Diracik</span>
                        <span class="hero-mini-chip wait">&#9203; A-004 Menunggu</span>
                    </div>
                </div>
            </div>
        </section>`,

    features: (d) => `
        <section class="modern-features-grid">
            ${(d.items || []).map(item => `
                <div class="feature-card">
                    <div class="feature-icon-box">
                        <i class="${item.icon} simg"></i>
                    </div>
                    <h3 class="feature-title">${escHtml(item.title)}</h3>
                    <p class="feature-desc">${escHtml(item.content)}</p>
                    ${item.linkTarget ? `<a href="javascript:void(0)" class="feature-link" onclick="web.navigate('${item.linkTarget}')">${escHtml(item.linkText)}</a>` : ''}
                </div>`).join('')}
        </section>`,

    article: (d) => `
        <section class="modern-two-col">
            <div class="surface-card">
                ${d.leftCol.subtitle ? `<div class="surface-card-header"><h2>${escHtml(d.leftCol.subtitle)}</h2></div>` : ''}
                <div class="surface-card-body">
                    ${components.lineRenderer(d.leftCol.lines || [], d.leftCol)}
                </div>
            </div>
            <div class="surface-card">
                ${d.rightCol.subtitle ? `<div class="surface-card-header"><h2>${escHtml(d.rightCol.subtitle)}</h2></div>` : ''}
                <div class="surface-card-body">
                    ${components.lineRenderer(d.rightCol.lines || [], d.rightCol)}
                </div>
            </div>
        </section>`,

    articleFull: (d) => `
        <section class="surface-card">
            ${d.subtitle ? `<div class="surface-card-header"><h2>${escHtml(d.subtitle)}</h2></div>` : ''}
            <div class="surface-card-body">
                ${components.lineRenderer(d.lines || [], d)}
            </div>
        </section>`,

    statGrid: (d) => `
        <section class="modern-stat-grid">
            ${(d.stats || []).map(s => `
                <div class="stat-card">
                    <div class="stat-label">${escHtml(s.label)}</div>
                    <div class="stat-value">${s.value}</div>
                </div>`).join('')}
        </section>`,

    barChart: (d) => {
        const items  = d.items || [];
        const max    = Math.max(1, ...items.map(i => i.value));
        const barH = 32, gap = 12, leftW = 190, chartW = 400, topPad = 12;
        const height = items.length * (barH + gap) + topPad || (barH + topPad);

        const bars = items.map((it, i) => {
            const y = topPad + i * (barH + gap);
            const w = max ? Math.max(6, (it.value / max) * chartW) : 0;
            return `
                <text x="0" y="${y + barH / 2}" class="chart-label" text-anchor="start">${escHtml(it.label)}</text>
                <rect x="${leftW}" y="${y}" width="${chartW}" height="${barH}" class="chart-track" rx="8"></rect>
                <rect x="${leftW}" y="${y}" width="${w}" height="${barH}" class="chart-bar" rx="8"></rect>
                <text x="${leftW + w + 10}" y="${y + barH / 2}" class="chart-value">${escHtml(String(it.value))}</text>`;
        }).join('');

        return `
            <section class="surface-card">
                ${d.title ? `<div class="surface-card-header"><h2>${escHtml(d.title)}</h2></div>` : ''}
                <div class="surface-card-body">
                    <div class="chart-wrap">
                        ${items.length
                            ? `<svg class="chart-svg" viewBox="0 0 ${leftW + chartW + 80} ${height}">${bars}</svg>`
                            : '<div class="empty-state-box">Belum ada data statistik untuk ditampilkan.</div>'}
                    </div>
                </div>
            </section>`;
    },

    renderTable: (dataTable, opts = {}) => {
        if (!dataTable?.length) return '';
        const allKeys  = Object.keys(dataTable[0]);
        const hidden   = new Set(opts.hiddenKeys || []);
        const keys     = opts.visibleKeys ? opts.visibleKeys.filter(k => !hidden.has(k)) : allKeys.filter(k => !hidden.has(k));
        const labels   = opts.labels || {};
        const rawKeys  = new Set(opts.rawKeys || []);

        const head = keys.map(k => `<th>${escHtml(labels[k] || k)}</th>`).join('');
        const body = dataTable.map(row => `<tr>${keys.map(k => {
            const val = row[k] ?? '';
            return `<td>${rawKeys.has(k) ? val : escHtml(val)}</td>`;
        }).join('')}</tr>`).join('')
            || `<tr><td colspan="${keys.length}" style="text-align:center;color:var(--color-muted)">Tidak ada data.</td></tr>`;

        return `<div class="table-container"><table>
            <thead><tr>${head}</tr></thead>
            <tbody>${body}</tbody>
        </table></div>`;
    },
};

// ============================================================
// UI — Render Engine
// ============================================================
const ui = {
    render: async (id, dataArray) => {
        const el = web.gebi(id);
        if (!el || !Array.isArray(dataArray)) return;
        el.classList.add('content-fade-out');
        const rendered = await Promise.all(
            dataArray.map(d => Promise.resolve(components[d.section]?.(d) || ''))
        );
        el.innerHTML = rendered.join('');
        requestAnimationFrame(() => el.classList.remove('content-fade-out'));
    },
};

window.addEventListener('popstate', () => web.navigate());

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') web.closeDrawer?.();
});

document.addEventListener('click', (e) => {
    const burger = web.gebi('burgerBtn');
    const nav    = web.gebi('navLinks');
    if (burger?.contains(e.target)) {
        nav.classList.toggle('active');
        e.stopPropagation();
    } else if (nav?.classList.contains('active') && !nav.contains(e.target)) {
        nav.classList.remove('active');
    }

    if (!e.target.closest('.nav-parent')) {
        document.querySelectorAll('.nav-parent.open').forEach(el => el.classList.remove('open'));
    }
});
