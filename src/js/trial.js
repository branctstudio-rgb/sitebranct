/* Trial signup handler — landing /crm-gestao.html
 *
 * Responsabilidades:
 *   1. Captura UTMs da URL → sessionStorage → hidden inputs do form
 *   2. Smooth-scroll de qualquer <a href="#trial-signup"> para o form
 *   3. Dispara ViewContent quando o form entra no viewport (>=50%)
 *   4. Submete o form à Edge Function trial-signup do Supabase
 *   5. Dispara Lead (pre-fetch) e StartTrial (após sucesso)
 *
 * Eventos Pixel passam por window.brancrPixel.track() — definido no inline IIFE
 * de crm-gestao.html — para respeitar o consent gate RGPD do banner de cookies.
 * Se o utilizador recusou cookies, nada é enviado ao Meta.
 */
(function () {
    'use strict';

    var FUNCTION_URL = 'https://ksocmuesmlqzpbtmibgu.supabase.co/functions/v1/trial-signup';
    var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__8ALaFu_zQPAaCimhaxU2w__LHo6613';

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
        btn.textContent = busy ? 'A criar a tua conta...' : 'Começar 7 dias grátis →';
    }

    function handleSubmit(event) {
        event.preventDefault();
        var form = event.target;
        var submitBtn = document.getElementById('trial-submit');
        var messageEl = document.getElementById('trial-message');

        setMessage(messageEl, '');
        setBusy(submitBtn, true);

        var data = {
            nome: (form.nome.value || '').trim(),
            email: (form.email.value || '').trim().toLowerCase(),
            empresa: (form.empresa.value || '').trim() || null,
            utm_source: form.utm_source.value || null,
            utm_medium: form.utm_medium.value || null,
            utm_campaign: form.utm_campaign.value || null,
            utm_content: form.utm_content.value || null,
            utm_term: form.utm_term.value || null,
            referrer: document.referrer || null,
            landing_url: window.location.href,
            user_agent: navigator.userAgent || null
        };

        if (!data.nome || !data.email || !EMAIL_RE.test(data.email)) {
            setMessage(messageEl, 'Preenche o teu nome e um email válido.', 'error');
            setBusy(submitBtn, false);
            return;
        }

        // Lead dispara ANTES da resposta — captura intent mesmo se a fetch falhar.
        // Só dispara se o utilizador deu consentimento (gate em window.brancrPixel).
        track('Lead', {
            content_name: 'Branct CRM Trial',
            content_category: 'CRM',
            currency: 'EUR',
            value: 0
        });

        fetch(FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_PUBLISHABLE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_PUBLISHABLE_KEY
            },
            body: JSON.stringify(data)
        }).then(function (response) {
            return response.json().then(function (body) {
                return { ok: response.ok, status: response.status, body: body };
            }).catch(function () {
                return { ok: response.ok, status: response.status, body: null };
            });
        }).then(function (result) {
            if (!result.ok) {
                var err = (result.body && result.body.error) || 'Erro ao criar conta';
                throw new Error(err);
            }

            // StartTrial só após confirmação do servidor
            track('StartTrial', {
                value: 0,
                currency: 'EUR',
                predicted_ltv: 480
            });

            setMessage(messageEl, 'Conta criada! A redirecionar-te...', 'success');
            var redirect = (result.body && result.body.redirectUrl) || 'https://app.branct.com/signup';
            setTimeout(function () { window.location.href = redirect; }, 1500);
        }).catch(function (err) {
            console.error('[Branct Trial] signup error:', err);
            setMessage(
                messageEl,
                'Tivemos um problema. <a href="https://app.branct.com/signup" target="_blank" rel="noopener noreferrer">Tenta criar conta diretamente aqui</a>.',
                'html'
            );
            setBusy(submitBtn, false);
        });
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
