/* BRANCT.Tech — boot das páginas migradas para a linguagem "Premium Light 2026"
 *
 * Substitui o main.js (que continua a servir as páginas antigas) nas páginas
 * que já usam branct.css. Sem dependências externas.
 *
 * Módulos: consent+Pixel · i18n · header · drawer · dropdown · langSelector ·
 *          reveals · forms (webhook n8n)
 *
 * Tracking (mesma regra de ouro do CLAUDE.md):
 *  - Pixel 1595310191130205 init + PageView SÓ após consent (banner RGPD,
 *    localStorage 'branct_consent' v1 — mesma chave/versão da landing CRM,
 *    para não re-pedir a quem já decidiu).
 *  - Lead dispara 1x no submit do form de contacto, com eventID UUID.
 *  - StartTrial NUNCA dispara no site — é exclusivo de app.branct.com/signup.
 */
(function () {
    'use strict';

    /* ============ CONSENT + META PIXEL ============ */
    var CONSENT_KEY = 'branct_consent';
    var CONSENT_VER = 'v1';
    var PIXEL_ID = '1595310191130205';

    function readConsent() {
        try { return JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null'); }
        catch (e) { return null; }
    }
    function saveConsent(status) {
        try {
            localStorage.setItem(CONSENT_KEY, JSON.stringify({ status: status, version: CONSENT_VER, ts: Date.now() }));
        } catch (e) { /* segue sem persistir */ }
    }

    // fbevents.js só é carregado quando (e se) há consentimento — em recusa,
    // nem o script da Meta toca na página.
    function loadPixelAndInit() {
        if (window.__brancrPixelInited) return;
        window.__brancrPixelInited = true;
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
        n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
        document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', PIXEL_ID);
        fbq('track', 'PageView');
    }

    function pixelTrack(name, params, options) {
        if (window.fbq && window.__brancrPixelInited) {
            if (options) { fbq('track', name, params || {}, options); }
            else { fbq('track', name, params || {}); }
        }
    }
    window.brancrPixel = {
        track: pixelTrack,
        isInited: function () { return !!window.__brancrPixelInited; }
    };

    function uuid() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    function setupConsent() {
        var stored = readConsent();
        if (stored && stored.status === 'granted' && stored.version === CONSENT_VER) {
            loadPixelAndInit();
        }
        var banner = document.getElementById('consent-banner');
        if (!banner) return;
        var needsDecision = !stored || stored.version !== CONSENT_VER;
        if (needsDecision) {
            banner.hidden = false;
            requestAnimationFrame(function () {
                requestAnimationFrame(function () { banner.classList.add('is-visible'); });
            });
        }
        function dismiss() {
            banner.classList.remove('is-visible');
            setTimeout(function () { banner.hidden = true; }, 500);
        }
        var accept = document.getElementById('consent-accept');
        var reject = document.getElementById('consent-reject');
        if (accept) accept.addEventListener('click', function () { saveConsent('granted'); loadPixelAndInit(); dismiss(); });
        if (reject) reject.addEventListener('click', function () { saveConsent('denied'); dismiss(); });
    }

    /* ============ i18n ============ */
    var LANG_KEY = 'branct_lang';
    var LANGS = ['pt', 'en', 'it', 'hr'];
    var translations = null;
    var i18nAbort = null;

    function getNested(obj, path) {
        return path.split('.').reduce(function (prev, curr) { return prev ? prev[curr] : null; }, obj);
    }

    function applyTranslations() {
        if (!translations) return;
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var text = getNested(translations, el.dataset.i18n);
            if (!text) return;
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') { el.placeholder = text; }
            else if (el.hasAttribute('data-i18n-html')) { el.innerHTML = text; }
            else { el.textContent = text; }
        });
        document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
            var text = getNested(translations, el.dataset.i18nTitle);
            if (text) el.title = text;
        });
        document.querySelectorAll('[data-i18n-content]').forEach(function (el) {
            var text = getNested(translations, el.dataset.i18nContent);
            if (text) el.setAttribute('content', text);
        });
    }

    function loadLanguage(lang) {
        if (LANGS.indexOf(lang) === -1) lang = 'pt';
        if (i18nAbort) i18nAbort.abort();
        i18nAbort = new AbortController();
        return fetch('src/i18n/' + lang + '.json', { signal: i18nAbort.signal })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (json) {
                translations = json;
                window.__brancrT = translations; // acesso para forms (mensagens)
                var cur = document.getElementById('current-lang');
                if (cur) cur.textContent = lang.toUpperCase();
                document.documentElement.lang = (lang === 'pt') ? 'pt-PT' : lang;
                try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
                applyTranslations();
            })
            .catch(function (err) { if (err.name !== 'AbortError') console.error('[i18n]', err); })
            .finally(function () { i18nAbort = null; });
    }

    function setupLangSelector() {
        var selector = document.querySelector('.lang-selector');
        if (!selector) return;
        var btn = selector.querySelector('.lang-btn');
        var options = selector.querySelectorAll('.lang-dropdown li');
        btn.setAttribute('aria-expanded', 'false');
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var open = selector.classList.toggle('is-open');
            btn.setAttribute('aria-expanded', open);
        });
        document.addEventListener('click', function () {
            selector.classList.remove('is-open');
            btn.setAttribute('aria-expanded', 'false');
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') selector.classList.remove('is-open');
        });
        options.forEach(function (opt) {
            opt.setAttribute('role', 'option');
            opt.setAttribute('tabindex', '0');
            function choose() {
                selector.classList.remove('is-open');
                loadLanguage(opt.dataset.lang);
            }
            opt.addEventListener('click', choose);
            opt.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
            });
        });
    }

    /* ============ HEADER / NAV ============ */
    function setupHeader() {
        var header = document.querySelector('.header');
        if (!header) return;
        var update = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
        window.addEventListener('scroll', update, { passive: true });
        update();

        // Dropdown "Serviços" — CSS trata hover/focus-within; JS só o aria + toque
        var dd = document.querySelector('.nav-item--dropdown');
        var ddBtn = dd ? dd.querySelector('button') : null;
        if (dd && ddBtn) {
            ddBtn.addEventListener('click', function () {
                var open = dd.classList.toggle('is-open');
                ddBtn.setAttribute('aria-expanded', open);
            });
        }
    }

    function setupDrawer() {
        var toggle = document.querySelector('.mobile-toggle');
        var drawer = document.querySelector('.mobile-drawer');
        var overlay = document.querySelector('.drawer-overlay');
        if (!toggle || !drawer) return;

        function setOpen(open) {
            drawer.classList.toggle('is-open', open);
            toggle.classList.toggle('is-active', open);
            toggle.setAttribute('aria-expanded', open);
            if (overlay) overlay.classList.toggle('is-visible', open);
            document.body.style.overflow = open ? 'hidden' : '';
            if (open) {
                var first = drawer.querySelector('a, button');
                if (first) first.focus();
            } else {
                toggle.focus();
            }
        }
        toggle.setAttribute('aria-expanded', 'false');
        toggle.addEventListener('click', function () { setOpen(!drawer.classList.contains('is-open')); });
        if (overlay) overlay.addEventListener('click', function () { setOpen(false); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && drawer.classList.contains('is-open')) setOpen(false);
        });
        drawer.querySelectorAll('a').forEach(function (a) {
            a.addEventListener('click', function () { setOpen(false); });
        });
        // Focus trap simples
        drawer.addEventListener('keydown', function (e) {
            if (e.key !== 'Tab') return;
            var focusables = drawer.querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])');
            if (!focusables.length) return;
            var first = focusables[0], last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        });

        // Acordeão de serviços no drawer
        var accBtn = drawer.querySelector('.nav-item--accordion button');
        var accMenu = drawer.querySelector('.mobile-submenu');
        if (accBtn && accMenu) {
            accBtn.addEventListener('click', function () {
                var open = accMenu.classList.toggle('is-open');
                accBtn.setAttribute('aria-expanded', open);
            });
        }
    }

    /* ============ TILT 3D ============ */
    // Cards .tilt inclinam-se a seguir o cursor (±MAX graus, com lerp).
    // CSS desenha (vars --rx/--ry/--mx/--my); só corre em rato fino e
    // sem prefers-reduced-motion — em táctil fica um card normal.
    function setupTilt() {
        var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        var noMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!fine || noMotion) return;

        var MAX = 7; // graus
        document.querySelectorAll('.tilt').forEach(function (el) {
            var rect = null;
            el.addEventListener('pointerenter', function () {
                rect = el.getBoundingClientRect();
                el.classList.add('is-tilting');
            });
            el.addEventListener('pointermove', function (e) {
                if (!rect) rect = el.getBoundingClientRect();
                var px = (e.clientX - rect.left) / rect.width;   // 0..1
                var py = (e.clientY - rect.top) / rect.height;
                // Escreve direto; a suavização é da transição CSS (.is-tilting)
                el.style.setProperty('--ry', ((px - 0.5) * 2 * MAX).toFixed(2));
                el.style.setProperty('--rx', ((0.5 - py) * 2 * MAX).toFixed(2));
                el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
                el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
            });
            el.addEventListener('pointerleave', function () {
                rect = null;
                el.style.setProperty('--rx', '0');
                el.style.setProperty('--ry', '0');
                el.classList.remove('is-tilting');
            });
        });
    }

    /* ============ VÍDEO LAZY (autoplay só quando visível) ============ */
    // <video data-lazy-video> com <source data-src=...>: o src só é
    // atribuído quando o vídeo se aproxima do viewport; play/pause
    // conforme visibilidade. Poupa o peso do vídeo a quem não chega lá.
    function setupLazyVideo() {
        var vids = document.querySelectorAll('video[data-lazy-video]');
        if (!vids.length) return;
        var noMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        function hydrate(v) {
            v.querySelectorAll('source[data-src]').forEach(function (s) {
                s.src = s.dataset.src; s.removeAttribute('data-src');
            });
            v.load();
        }
        if (!('IntersectionObserver' in window)) { vids.forEach(hydrate); return; }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                var v = entry.target;
                if (entry.isIntersecting) {
                    if (v.querySelector('source[data-src]')) hydrate(v);
                    if (!noMotion) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
                } else if (!v.paused) {
                    v.pause();
                }
            });
        }, { rootMargin: '200px 0px' });
        vids.forEach(function (v) { io.observe(v); });
    }

    /* ============ REVEALS ============ */
    function setupReveals() {
        var els = document.querySelectorAll('.reveal, .reveal-stagger');
        if (!els.length) return;
        if (!('IntersectionObserver' in window)) {
            els.forEach(function (el) { el.classList.add('is-visible'); });
            return;
        }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        els.forEach(function (el) { io.observe(el); });
    }

    /* ============ FORMS (webhook n8n) ============ */
    var WEBHOOK_URL = 'https://n8n.branct.com/webhook/site-lead';
    var WEBHOOK_TOKEN = '046afad8-d9e8-409d-8d21-86d2e5adbf9e';

    function sendLead(payload) {
        return fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: WEBHOOK_TOKEN,
                nome: payload.name || payload.nome || '',
                email: payload.email || '',
                telefone: payload.phone || payload.telefone || '',
                empresa: payload.company || payload.empresa || '',
                interesse: payload.interest || payload.interesse || '',
                mensagem: payload.message || payload.mensagem || '',
                source: payload.source || ''
            })
        }).then(function (res) {
            return res.json().then(function (result) {
                if (!result.success) throw new Error((result.error && result.error.message) || 'HTTP ' + res.status);
                return result;
            });
        });
    }

    function setupLeadForms() {
        document.querySelectorAll('form[data-lead-form]').forEach(function (form) {
            var msg = form.querySelector('.form-msg');
            var btn = form.querySelector('[type="submit"]');
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var invalid = null;
                form.querySelectorAll('[required]').forEach(function (f) {
                    f.closest('.field') && f.closest('.field').classList.toggle('field--error', !f.checkValidity());
                    if (!f.checkValidity() && !invalid) invalid = f;
                });
                if (invalid) { invalid.focus(); return; }

                var original = btn ? btn.textContent : '';
                if (btn) { btn.disabled = true; btn.textContent = '…'; }
                if (msg) { msg.textContent = ''; msg.className = 'form-msg'; }

                var payload = {};
                new FormData(form).forEach(function (v, k) { payload[k] = v; });
                payload.source = form.dataset.leadForm || 'site';

                sendLead(payload).then(function () {
                    // Lead (intenção) — 1x por submissão, sob consent gate
                    pixelTrack('Lead', {
                        content_name: 'Contacto ' + payload.source,
                        content_category: 'Agency'
                    }, { eventID: uuid() });
                    var t = window.__brancrT && getNested(window.__brancrT, 'form.success');
                    if (msg) { msg.textContent = t || 'Enviado! Respondemos dentro de 24h.'; msg.className = 'form-msg success'; }
                    form.reset();
                }).catch(function () {
                    var t = window.__brancrT && getNested(window.__brancrT, 'form.error');
                    if (msg) { msg.textContent = t || 'Erro ao enviar. Tenta novamente ou fala connosco no WhatsApp.'; msg.className = 'form-msg error'; }
                }).finally(function () {
                    if (btn) { btn.disabled = false; btn.textContent = original; }
                });
            });
        });
    }

    /* ============ BOOT ============ */
    function init() {
        setupConsent();
        setupHeader();
        setupDrawer();
        setupLangSelector();
        setupReveals();
        setupTilt();
        setupLazyVideo();
        setupLeadForms();
        var saved = 'pt';
        try { saved = localStorage.getItem(LANG_KEY) || 'pt'; } catch (e) {}
        loadLanguage(saved);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
