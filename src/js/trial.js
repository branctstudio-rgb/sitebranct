/* Trial signup handler — landing /crm-gestao.html
 *
 * Responsabilidades:
 *   1. Captura UTMs da URL → sessionStorage → hidden inputs do form
 *   2. Smooth-scroll de qualquer <a href="#trial-signup"> para o form
 *   3. Dispara ViewContent quando o form entra no viewport (>=50%)
 *   4. Valida nome/email e redireciona para app.branct.com/signup com
 *      ?trial=true&name=&email=&company= + UTMs preservadas
 *   5. Dispara Lead e StartTrial antes do redirect
 *
 * A password nunca passa por esta página estática — é pedida apenas no /signup
 * do CRM, que cria a conta via Supabase Auth e autentica de imediato.
 *
 * Eventos Pixel passam por window.brancrPixel.track() — definido no inline IIFE
 * de crm-gestao.html — para respeitar o consent gate RGPD do banner de cookies.
 * Se o utilizador recusou cookies, nada é enviado ao Meta.
 */
(function () {
    'use strict';

    var SIGNUP_URL = 'https://app.branct.com/signup';

    var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function track(name, params) {
        if (window.brancrPixel && typeof window.brancrPixel.track === 'function') {
            window.brancrPixel.track(name, params || {});
        }
    }

    function captureUTMs() {
        var params = new URLSearchParams(window.location.search);
        UTM_KEYS.forEach(function (key) {
            var fromUrl = params.get(key);
            if (fromUrl) {
                try { sessionStorage.setItem(key, fromUrl); } catch (e) {}
            }
            var stored;
            try { stored = sessionStorage.getItem(key); } catch (e) { stored = fromUrl; }
            var input = document.getElementById(key.replace('utm_', 'utm-'));
            if (input && stored) input.value = stored;
        });
    }

    function setupScrollLinks() {
        var links = document.querySelectorAll('a[href="#trial-signup"]');
        links.forEach(function (link) {
            link.addEventListener('click', function (e) {
                var target = document.getElementById('trial-signup');
                if (!target) return;
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setTimeout(function () {
                    var nome = document.getElementById('trial-nome');
                    if (nome && typeof nome.focus === 'function') nome.focus();
                }, 600);
            });
        });
    }

    function setupViewContentTracking() {
        var target = document.getElementById('trial-signup');
        if (!target || !('IntersectionObserver' in window)) return;

        var fired = false;
        var io = new IntersectionObserver(function (entries) {
            for (var i = 0; i < entries.length; i++) {
                if (entries[i].isIntersecting && !fired) {
                    track('ViewContent', {
                        content_name: 'Trial Signup Form',
                        content_category: 'CRM'
                    });
                    fired = true;
                    io.disconnect();
                    return;
                }
            }
        }, { threshold: 0.5 });

        io.observe(target);
    }

    function setMessage(el, text, kind) {
        if (!el) return;
        if (kind === 'html') { el.innerHTML = text; el.className = 'trial-message error'; return; }
        el.textContent = text || '';
        el.className = 'trial-message' + (kind ? ' ' + kind : '');
    }

    function setBusy(btn, busy) {
        if (!btn) return;
        btn.disabled = !!busy;
        btn.textContent = busy ? 'A redirecionar-te...' : 'Começar 7 dias grátis →';
    }

    function handleSubmit(event) {
        event.preventDefault();
        var form = event.target;
        var submitBtn = document.getElementById('trial-submit');
        var messageEl = document.getElementById('trial-message');

        setMessage(messageEl, '');

        var nome = (form.nome.value || '').trim();
        var email = (form.email.value || '').trim().toLowerCase();
        var empresa = (form.empresa.value || '').trim();

        if (!nome || !email || !EMAIL_RE.test(email)) {
            setMessage(messageEl, 'Preenche o teu nome e um email válido.', 'error');
            return;
        }

        setBusy(submitBtn, true);

        track('Lead', {
            content_name: 'Branct CRM Trial',
            content_category: 'CRM',
            currency: 'EUR',
            value: 0
        });
        track('StartTrial', {
            value: 0,
            currency: 'EUR',
            predicted_ltv: 480
        });

        // Empresa vazia → fallback para o nome do dono (evita erro de campo
        // obrigatório no /signup do CRM, que regista como cliente particular).
        var params = new URLSearchParams({
            trial: 'true',
            name: nome,
            email: email,
            company: empresa || nome
        });
        UTM_KEYS.forEach(function (key) {
            var input = form[key];
            if (input && input.value) params.set(key, input.value);
        });

        window.location.href = SIGNUP_URL + '?' + params.toString();
    }

    function init() {
        captureUTMs();
        setupScrollLinks();
        setupViewContentTracking();
        var form = document.getElementById('trial-form');
        if (form) form.addEventListener('submit', handleSubmit);

        if (window.location.hostname === 'localhost' || window.location.search.indexOf('debug=1') !== -1) {
            var snapshot = {};
            UTM_KEYS.forEach(function (k) {
                try { snapshot[k] = sessionStorage.getItem(k); } catch (e) { snapshot[k] = null; }
            });
            console.log('[Branct Trial] UTMs captured:', snapshot);
            console.log('[Branct Trial] Pixel inited:', !!(window.brancrPixel && window.brancrPixel.isInited()));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
