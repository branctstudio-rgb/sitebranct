/* Shared navigation component. No storage or network adapters. */
(function(){'use strict';
function setupDrawer() {
        var toggle = document.querySelector('.mobile-toggle');
        var drawer = document.querySelector('.mobile-drawer');
        var overlay = document.querySelector('.drawer-overlay');
        if (!toggle || !drawer) return;

        var close = drawer.querySelector('.drawer-close');
        if (!close) {
            close = document.createElement('button');
            close.type = 'button';
            close.className = 'drawer-close';
            close.setAttribute('aria-label', (drawer.getAttribute('data-close-label') || '').trim() || 'Fechar menu');
            close.innerHTML = '<span aria-hidden="true">×</span>';
            drawer.prepend(close);
        }
        // Evita a transição herdada de visibility aplicada pelo modo de movimento reduzido.
        // O ancestral continua a controlar integralmente quando o botão é apresentado.
        close.style.visibility = 'inherit';
        close.style.transitionProperty = 'none';
        var background = Array.prototype.filter.call(
            document.querySelectorAll('main, .footer, .consent'),
            function (element) { return !drawer.contains(element); }
        );
        var previousOverflow = '';
        var focusFrame = 0;

        function focusDrawer(attempts) {
            if (!drawer.classList.contains('is-open')) return;
            var first = drawer.querySelector('.drawer-close, a, button');
            if (first && window.getComputedStyle(first).visibility === 'visible') {
                focusFrame = 0;
                first.focus();
                return;
            }
            if (attempts > 0) {
                focusFrame = window.requestAnimationFrame(function () { focusDrawer(attempts - 1); });
            } else {
                focusFrame = 0;
            }
        }

        function setOpen(open) {
            if (focusFrame) {
                window.cancelAnimationFrame(focusFrame);
                focusFrame = 0;
            }
            drawer.classList.toggle('is-open', open);
            toggle.classList.toggle('is-active', open);
            toggle.setAttribute('aria-expanded', open);
            drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
            drawer.inert = !open;
            if (overlay) {
                overlay.classList.toggle('is-visible', open);
                overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
            }
            if (open) previousOverflow = document.body.style.overflow;
            document.body.style.overflow = open ? 'hidden' : previousOverflow;
            background.forEach(function (element) { element.inert = open; });
            if (open) {
                // visibility é discreta e pode propagar-se pelos descendentes em frames
                // distintos; só focar depois de o primeiro controlo estar realmente visível.
                focusDrawer(8);
            } else {
                toggle.focus();
            }
        }
        toggle.setAttribute('aria-expanded', 'false');
        drawer.setAttribute('aria-hidden', 'true');
        drawer.inert = true;
        toggle.addEventListener('click', function () { setOpen(!drawer.classList.contains('is-open')); });
        close.addEventListener('click', function () { setOpen(false); });
        if (overlay) overlay.addEventListener('click', function () { setOpen(false); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && drawer.classList.contains('is-open')) setOpen(false);
        });
        drawer.querySelectorAll('a').forEach(function (a) {
            a.addEventListener('click', function () { setOpen(false); });
        });
        // Focus trap simples
        drawer.addEventListener('keydown', function (e) {
            if (e.key !== 'Tab' || !drawer.classList.contains('is-open')) return;
            var focusables = Array.prototype.filter.call(
                drawer.querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])'),
                function (element) {
                    var style = window.getComputedStyle(element);
                    return !element.disabled && style.visibility === 'visible' && style.display !== 'none' && element.getClientRects().length > 0;
                }
            );
            if (!focusables.length) return;
            var current = focusables.indexOf(document.activeElement);
            var next;
            if (e.shiftKey) next = current <= 0 ? focusables.length - 1 : current - 1;
            else next = current < 0 || current >= focusables.length - 1 ? 0 : current + 1;
            e.preventDefault();
            focusables[next].focus();
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
setupDrawer();
const desktop=matchMedia('(min-width: 901px)');
desktop.addEventListener('change',()=>{const panel=document.querySelector('.mobile-drawer.is-open');if(desktop.matches&&panel)panel.querySelector('.drawer-close').click();});
})();
