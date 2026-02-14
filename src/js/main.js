// c:\Users\matec\Desktop\PROJETOS SITES\PROJETOS SITES BRANCTS\Site branct\src\js\main.js

/**
 * BRANCT Main Logic
 * Handles i18n, UI interactions, and Forms
 */

const APP = {
    state: {
        lang: localStorage.getItem('branct_lang') || navigator.language.split('-')[0] || 'pt',
        translations: {}
    },

    // GSAP context for safe cleanup on page navigation
    _gsapCtx: null,

    // AbortController for in-flight language fetch
    _i18nAbort: null,

    // Live region debounce timer
    _liveRegionTimer: null,

    // Debounce utility
    _debounce(fn, ms) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), ms);
        };
    },

    init() {
        // Critical path: preloader + i18n + navigation + theme + core animations
        this.initPreloader();
        this.setupI18n();
        this.setupNavigation();
        this.setupThemeToggle();
        this.setupAnimations();

        // Non-critical: defer to idle time or 2s fallback
        const deferSetup = () => {
            this.setupProjectHover();
            this.setupContactReveal();
            this.setupSpotlight();
            this.setupForms();
            this.setupContactForm();
            this.setupMagneticButton();
            this.setupRipple();
        };

        if ('requestIdleCallback' in window) {
            requestIdleCallback(deferSetup, { timeout: 2000 });
        } else {
            setTimeout(deferSetup, 200);
        }

        // Debounced resize handler for layout recalculations
        window.addEventListener('resize', this._debounce(() => {
            if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
        }, 200));

        // Horizontal scroll + process timeline deferred — starts only after loader is dismissed.
        // IMPORTANT: setupProcessTimeline MUST run AFTER initHorizontalScroll so that
        // ScrollTrigger positions account for the pin-spacer's extra scroll distance.
        window.addEventListener('loader-dismissed', () => {
            this.initHorizontalScroll();
            this.setupProcessTimeline();
            this.setupHeroParallax();
            this.setupCinematicScroll();
            // Force a full refresh so every trigger recalculates with the pin in place
            if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
        });
    },

    /* --- PRELOADER — Light Curtain --- */
    initPreloader() {
        const preloader   = document.getElementById('preloader');
        const loaderLogo  = preloader?.querySelector('.loader-logo');
        const loaderBar   = document.getElementById('loader-bar');
        const loaderPct   = document.getElementById('loader-percentage');
        const lightCurtain = preloader?.querySelector('.light-curtain');
        if (!preloader) return;

        let progress = 0;
        let engineReady = false;
        let assetsLoaded = false;
        let dismissed = false;

        const updateProgress = (value) => {
            progress = Math.min(Math.round(value), 100);
            if (loaderBar) loaderBar.style.width = progress + '%';
            if (loaderPct) loaderPct.textContent = progress + '%';
        };

        // ── Intro animation: reveal logo + bar ──
        const introReveal = () => {
            if (typeof gsap !== 'undefined') {
                gsap.to(loaderLogo, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' });
                gsap.to(loaderPct, { opacity: 1, duration: 0.6, delay: 0.3, ease: 'power2.out' });
            } else {
                if (loaderLogo) { loaderLogo.style.opacity = '1'; loaderLogo.style.transform = 'translateY(0)'; }
                if (loaderPct) loaderPct.style.opacity = '1';
            }
        };
        introReveal();

        // Simulate progressive loading (0% → 70%)
        const tick = setInterval(() => {
            if (progress < 70) {
                updateProgress(progress + Math.random() * 8);
            }
        }, 200);

        // Assets loaded (window.load)
        window.addEventListener('load', () => {
            assetsLoaded = true;
            updateProgress(85);
            tryDismiss();
        });

        // 3D engine ready — only wait if page has a WebGL canvas
        const has3D = document.getElementById('webgl-canvas') || document.getElementById('canvas-3d');
        if (has3D) {
            // Module scripts run before DOMContentLoaded — check if already ready
            if (window.__plexusReady) {
                engineReady = true;
            } else {
                window.addEventListener('plexus-ready', () => {
                    engineReady = true;
                    updateProgress(100);
                    tryDismiss();
                });
            }
        } else {
            // No 3D on this page — skip engine wait
            engineReady = true;
        }

        // Safety timeout — dismiss after 5s max (only relevant for 3D pages)
        setTimeout(() => {
            engineReady = true;
            assetsLoaded = true;
            updateProgress(100);
            tryDismiss();
        }, 5000);

        const tryDismiss = () => {
            if (!engineReady || !assetsLoaded || dismissed) return;
            dismissed = true;
            clearInterval(tick);
            updateProgress(100);

            // ── Cinematic Light Curtain exit sequence ──
            setTimeout(() => {
                if (typeof gsap !== 'undefined') {
                    const tl = gsap.timeline({
                        onComplete: () => {
                            preloader.classList.add('hidden');
                            preloader.style.display = 'none';
                            window.dispatchEvent(new CustomEvent('loader-dismissed'));
                        }
                    });

                    // 1. Fade out loader content
                    tl.to('.loader-content', {
                        opacity: 0,
                        y: -20,
                        duration: 0.5,
                        ease: 'power2.in'
                    });

                    // 2. Sweep the light curtain across the screen
                    tl.to(lightCurtain, {
                        left: '100%',
                        duration: 1.2,
                        ease: 'expo.inOut'
                    }, '-=0.2');

                    // 3. Simultaneously fade out the preloader background
                    tl.to(preloader, {
                        opacity: 0,
                        duration: 0.6,
                        ease: 'power2.out'
                    }, '-=0.5');

                    // 4. Reveal hero elements — per-character title + staggered sections
                    const heroTitle = document.querySelector('.hero__title');
                    let titleChars = null;
                    if (heroTitle && typeof SplitType !== 'undefined') {
                        try {
                            const split = new SplitType(heroTitle, { types: 'words,chars' });
                            titleChars = split.chars;
                        } catch (_) { /* SplitType unavailable */ }
                    }

                    if (titleChars && titleChars.length) {
                        // Make parent visible — chars handle their own opacity
                        gsap.set(heroTitle, { opacity: 1, y: 0 });
                        // Phase A: Per-character reveal with scale + 3D rotation
                        tl.fromTo(titleChars,
                            { opacity: 0, y: 40, scale: 0.8, rotateX: -15 },
                            {
                                opacity: 1, y: 0, scale: 1, rotateX: 0,
                                duration: 0.6, stagger: 0.025,
                                ease: 'power3.out'
                            },
                            '-=0.3'
                        );
                    } else {
                        // Fallback: animate title as block
                        tl.fromTo('.hero__title',
                            { opacity: 0, y: 30 },
                            { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' },
                            '-=0.3'
                        );
                    }

                    // Phase B: Subtitle
                    tl.fromTo('.hero__subtitle',
                        { opacity: 0, y: 20 },
                        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' },
                        '-=0.2'
                    );

                    // Phase C: Buttons
                    tl.fromTo('.hero__buttons',
                        { opacity: 0, y: 20 },
                        { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' },
                        '-=0.1'
                    );

                    // Phase D: Proof cards with scale + rotation entrance
                    tl.fromTo('.proof-card',
                        { opacity: 0, y: 25, scale: 0.9, rotation: -2 },
                        {
                            opacity: 1, y: 0, scale: 1, rotation: 0,
                            duration: 0.6, stagger: 0.06,
                            ease: 'power3.out'
                        },
                        '-=0.2'
                    );
                } else {
                    // CSS-only fallback
                    preloader.style.transition = 'opacity 1s ease';
                    preloader.style.opacity = '0';
                    setTimeout(() => {
                        preloader.classList.add('hidden');
                        preloader.style.display = 'none';
                        window.dispatchEvent(new CustomEvent('loader-dismissed'));

                        // Reveal hero elements
                        document.querySelectorAll('.hero__title, .hero__subtitle, .hero__buttons, .proof-card')
                            .forEach((el, i) => {
                                setTimeout(() => {
                                    el.style.opacity = '1';
                                    el.style.transform = 'translateY(0)';
                                }, i * 100);
                            });
                    }, 1000);
                }
            }, 500);
        };
    },

    /* --- I18N SYSTEM --- */
    async setupI18n() {
        // Validate supported languages
        const supported = ['pt', 'en', 'it', 'hr'];
        if (!supported.includes(this.state.lang)) this.state.lang = 'pt';

        // Initial Load
        await this.loadLanguage(this.state.lang);
        this.updateUI();

        // Language Selector Logic
        const langBtn = document.querySelector('.lang-btn');
        const langDropdown = document.querySelector('.lang-dropdown');
        const langOptions = document.querySelectorAll('.lang-dropdown li');

        if (langBtn) {
            langBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                langDropdown.classList.toggle('active');
                // Focus first option when opening
                if (langDropdown.classList.contains('active') && langOptions.length) {
                    langOptions[0].setAttribute('tabindex', '0');
                    langOptions[0].focus();
                }
            });

            // Keyboard support for lang button
            langBtn.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    langDropdown.classList.add('active');
                    if (langOptions.length) {
                        langOptions[0].setAttribute('tabindex', '0');
                        langOptions[0].focus();
                    }
                }
            });
        }

        document.addEventListener('click', (e) => {
            if (langDropdown && !langDropdown.contains(e.target) && e.target !== langBtn) {
                langDropdown.classList.remove('active');
            }
        });

        const selectLang = async (opt) => {
            const newLang = opt.dataset.lang;
            langDropdown.classList.remove('active');
            langBtn.focus();
            if (newLang !== this.state.lang) {
                this.state.lang = newLang;
                localStorage.setItem('branct_lang', newLang);
                await this.loadLanguage(newLang);
                this.updateUI();
            }
        };

        langOptions.forEach((opt, idx) => {
            opt.setAttribute('role', 'option');
            opt.setAttribute('tabindex', '-1');

            opt.addEventListener('click', () => selectLang(opt));

            // Arrow key navigation within dropdown
            opt.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const next = langOptions[idx + 1] || langOptions[0];
                    next.setAttribute('tabindex', '0');
                    opt.setAttribute('tabindex', '-1');
                    next.focus();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const prev = langOptions[idx - 1] || langOptions[langOptions.length - 1];
                    prev.setAttribute('tabindex', '0');
                    opt.setAttribute('tabindex', '-1');
                    prev.focus();
                } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectLang(opt);
                } else if (e.key === 'Escape') {
                    langDropdown.classList.remove('active');
                    langBtn.focus();
                }
            });
        });
    },

    async loadLanguage(lang) {
        // Abort any in-flight i18n fetch
        if (this._i18nAbort) this._i18nAbort.abort();
        this._i18nAbort = new AbortController();

        try {
            const response = await fetch(`src/i18n/${lang}.json`, {
                signal: this._i18nAbort.signal
            });
            if (!response.ok) throw new Error(`HTTP ${response.status} loading ${lang}.json`);
            this.state.translations = await response.json();
            const langEl = document.getElementById('current-lang');
            if (langEl) langEl.textContent = lang.toUpperCase();
            document.documentElement.lang = lang === 'pt' ? 'pt-PT' : lang;
        } catch (error) {
            if (error.name === 'AbortError') return; // Silently ignore aborted requests
            console.error('Error loading language:', error);
        } finally {
            this._i18nAbort = null;
        }
    },

    updateUI() {
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.dataset.i18n;
            const text = this.getNestedTranslation(this.state.translations, key);
            if (text) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.placeholder = text;
                } else if (el.hasAttribute('data-i18n-html')) {
                    el.innerHTML = text;
                } else {
                    el.textContent = text;
                }
            }
        });
    },

    getNestedTranslation(obj, path) {
        return path.split('.').reduce((prev, curr) => prev ? prev[curr] : null, obj);
    },

    /* --- NAVIGATION --- */
    setupNavigation() {
        // Desktop Dropdown
        const dropdown = document.querySelector('.nav-item--dropdown');
        const submenu = document.querySelector('.services-submenu');
        const dropdownBtn = dropdown?.querySelector('button');

        if (dropdown && submenu && dropdownBtn) {
            const toggleSubmenu = (force) => {
                const isOpen = force ?? !submenu.classList.contains('open');
                submenu.classList.toggle('open', isOpen);
                dropdownBtn.setAttribute('aria-expanded', isOpen);
            };

            dropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSubmenu();
            });

            document.addEventListener('click', (e) => {
                if (!dropdown.contains(e.target)) {
                    toggleSubmenu(false);
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && submenu.classList.contains('open')) {
                    toggleSubmenu(false);
                }
            });
        }

        // Mobile Drawer & Accordion
        const mobileToggle = document.querySelector('.mobile-toggle');
        const drawer = document.querySelector('.mobile-drawer');
        const mobileAccordionBtn = document.querySelector('.nav-item--accordion button');
        const mobileSubmenu = document.querySelector('.mobile-submenu');

        if (mobileToggle && drawer) {
            const openDrawer = () => {
                drawer.classList.add('open');
                document.body.style.overflow = 'hidden';
                // Focus the first focusable element inside the drawer
                const firstFocusable = drawer.querySelector('a, button');
                if (firstFocusable) firstFocusable.focus();
            };

            const closeDrawer = () => {
                drawer.classList.remove('open');
                document.body.style.overflow = '';
                // Restore focus to the toggle button
                mobileToggle.focus();
            };

            const toggleMobileMenu = () => {
                if (drawer.classList.contains('open')) {
                    closeDrawer();
                } else {
                    openDrawer();
                }
            };

            mobileToggle.addEventListener('click', toggleMobileMenu);

            // Focus trap inside mobile drawer
            drawer.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    closeDrawer();
                    return;
                }
                if (e.key !== 'Tab') return;

                const focusable = drawer.querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])');
                if (!focusable.length) return;

                const first = focusable[0];
                const last = focusable[focusable.length - 1];

                if (e.shiftKey) {
                    if (document.activeElement === first) {
                        e.preventDefault();
                        last.focus();
                    }
                } else {
                    if (document.activeElement === last) {
                        e.preventDefault();
                        first.focus();
                    }
                }
            });
        }

        if (mobileAccordionBtn && mobileSubmenu) {
            mobileAccordionBtn.addEventListener('click', () => {
                const isExpanded = mobileAccordionBtn.getAttribute('aria-expanded') === 'true';
                mobileAccordionBtn.setAttribute('aria-expanded', !isExpanded);
                mobileSubmenu.style.display = isExpanded ? 'none' : 'block';
            });
        }
    },

    /* --- ANIMATIONS --- */
    setupAnimations() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.section').forEach(section => {
            observer.observe(section);
        });

        // Scroll-driven header blur intensification
        const headerEl = document.querySelector('.header');
        if (headerEl) {
            let lastScrollBlur = 0;
            window.addEventListener('scroll', () => {
                if (headerEl.classList.contains('header--hscroll') || headerEl.classList.contains('header--light')) return;
                const scrollY = window.scrollY;
                const blurVal = Math.min(12 + (scrollY / 300) * 18, 30);
                const bgAlpha = Math.min(0.6 + (scrollY / 300) * 0.25, 0.85);
                const rounded = Math.round(blurVal);
                if (rounded !== lastScrollBlur) {
                    lastScrollBlur = rounded;
                    headerEl.style.backdropFilter = `blur(${rounded}px)`;
                    headerEl.style.webkitBackdropFilter = `blur(${rounded}px)`;
                    headerEl.style.background = `rgba(5, 10, 15, ${bgAlpha.toFixed(2)})`;
                }
            }, { passive: true });
        }
    },

    /* --- THEME TOGGLE (Dark/Light) --- */
    setupThemeToggle() {
        const toggles = document.querySelectorAll('.theme-toggle');
        if (!toggles.length) return;

        // Restore saved theme
        const saved = localStorage.getItem('branct_theme');
        if (saved === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        }

        toggles.forEach(btn => {
            btn.addEventListener('click', () => {
                const isLight = document.documentElement.getAttribute('data-theme') === 'light';
                const newTheme = isLight ? 'dark' : 'light';

                if (newTheme === 'light') {
                    document.documentElement.setAttribute('data-theme', 'light');
                } else {
                    document.documentElement.removeAttribute('data-theme');
                }
                localStorage.setItem('branct_theme', newTheme);

                // Sync Three.js canvas visibility
                this.syncThemeToCanvas(newTheme);
            });
        });

        // Sync on initial load if light
        if (saved === 'light') {
            this.syncThemeToCanvas('light');
        }
    },

    syncThemeToCanvas(theme) {
        // Notify 3D scene to adapt colors/bloom for current theme
        const scene = window.plexusScene;
        if (scene && typeof scene.adaptToTheme === 'function') {
            scene.adaptToTheme(theme);
        } else {
            // Fallback: hide canvas if 3D not initialized
            const canvas = document.getElementById('webgl-canvas');
            if (!canvas) return;
            if (theme === 'light') {
                canvas.style.transition = 'opacity 0.5s ease';
                canvas.style.opacity = '0';
            } else {
                canvas.style.transition = 'opacity 0.5s ease';
                canvas.style.opacity = '';
            }
        }
    },

    /* --- HERO PARALLAX LAYERS --- */
    setupHeroParallax() {
        if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const hero = document.querySelector('.hero');
        if (!hero) return;

        const parallaxItems = [
            { selector: '.hero__subtitle', y: -40 },
            { selector: '.hero__buttons', y: -60 },
            { selector: '.hero-proof-grid', y: -25 }
        ];

        parallaxItems.forEach(({ selector, y }) => {
            const el = hero.querySelector(selector);
            if (!el) return;
            gsap.to(el, {
                y,
                ease: 'none',
                scrollTrigger: {
                    trigger: hero,
                    start: 'top top',
                    end: 'bottom top',
                    scrub: 0.5
                }
            });
        });
    },

    /* --- HORIZONTAL SCROLL (GSAP ScrollTrigger) --- */
    initHorizontalScroll() {
        const track = document.querySelector('.horizontal-track');
        const viewport = document.querySelector('#horizontal-viewport');
        if (!track || !viewport) return;

        // Skip animation engine if user prefers reduced motion
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        // Wait for GSAP to be available (loaded via CDN)
        if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
            console.warn('GSAP not loaded — horizontal scroll disabled.');
            return;
        }

        gsap.registerPlugin(ScrollTrigger);

        const slides = document.querySelectorAll('.h-slide');
        const segments = document.querySelectorAll('.h-progress__segment');
        const counter = document.querySelector('.h-progress__counter .current');
        const totalSlides = slides.length;
        const overlay = document.querySelector('.overlay-gradient');
        const header = document.querySelector('.header');

        // Color palette per slide: Dark Ocean → Ocean → Teal → Cyan (BRANCT palette)
        const slideColors = ['#072c3d', '#1c5a74', '#097697', '#6ec1e4'];

        // Wrap in gsap.context for clean memory disposal on navigation
        this._gsapCtx = gsap.context(() => {
            ScrollTrigger.matchMedia({
                '(min-width: 769px)': function () {

                    // Throttle state for expensive overlay gradient updates
                    let _lastOverlayIndex = -1;

                    // ── Main horizontal tween ──
                    const horizontalTween = gsap.to(track, {
                        xPercent: -75,
                        ease: 'none',
                        force3D: true,
                        scrollTrigger: {
                            trigger: viewport,
                            pin: true,
                            scrub: 0.5,
                            anticipatePin: 1,
                            end: () => '+=' + (track.offsetWidth - viewport.offsetWidth),

                            // Header micro-interaction
                            onEnter: () => {
                                header.classList.add('header--hscroll');
                                if (window.plexusScene) window.plexusScene.scrollActive = true;
                            },
                            onLeave: () => {
                                header.classList.remove('header--hscroll');
                                const s = window.plexusScene;
                                if (s) s.scrollActive = false;
                            },
                            onEnterBack: () => {
                                header.classList.add('header--hscroll');
                                if (window.plexusScene) window.plexusScene.scrollActive = true;
                            },
                            onLeaveBack: () => {
                                header.classList.remove('header--hscroll');
                                const s = window.plexusScene;
                                if (s) s.scrollActive = false;
                            },

                            onUpdate: (self) => {
                                const progress = self.progress;

                                const activeIndex = Math.min(
                                    Math.floor(progress * totalSlides),
                                    totalSlides - 1
                                );

                                // Only touch DOM when slide actually changes
                                if (activeIndex !== _lastOverlayIndex) {
                                    _lastOverlayIndex = activeIndex;

                                    // Sync progress segments
                                    segments.forEach((seg, i) => {
                                        seg.classList.toggle('active', i === activeIndex);
                                    });

                                    // Sync counter
                                    if (counter) {
                                        counter.textContent = String(activeIndex + 1).padStart(2, '0');
                                    }

                                    // Live region — announce current slide to screen readers (debounced)
                                    clearTimeout(APP._liveRegionTimer);
                                    APP._liveRegionTimer = setTimeout(() => {
                                        const liveRegion = document.getElementById('scroll-live-region');
                                        const slideTitle = slides[activeIndex]?.querySelector('.h-slide__title')?.textContent;
                                        if (liveRegion && slideTitle) {
                                            liveRegion.textContent = `Serviço ${activeIndex + 1} de ${totalSlides}: ${slideTitle}`;
                                        }
                                    }, 2000);

                                    // Tint overlay gradient (only on slide change, not every pixel)
                                    if (overlay) {
                                        const slideColor = gsap.utils.interpolate(slideColors, progress);
                                        const c = gsap.utils.splitColor(slideColor);
                                        const r = Math.round(2 + (c[0] - 2) * 0.2);
                                        const g = Math.round(4 + (c[1] - 4) * 0.2);
                                        const b = Math.round(6 + (c[2] - 6) * 0.2);
                                        overlay.style.background =
                                            `radial-gradient(circle at 50% 40%, rgba(${r},${g},${b}, 0.15) 0%, rgba(2, 4, 6, 0.55) 80%)`;
                                    }
                                }

                                // ── Color Flow (lightweight — no DOM) ──
                                const currentColor = gsap.utils.interpolate(slideColors, progress);

                                // Feed to Three.js — robust bridge
                                const scene = window.plexusScene;
                                if (scene && scene.targetColor) {
                                    scene.scrollProgress = self.progress;
                                    scene.targetColor.set(currentColor);
                                }
                            }
                        }
                    });

                    // ── Text Stagger Reveal per slide ──
                    slides.forEach((slide, i) => {
                        const targets = slide.querySelectorAll(
                            '.h-slide__badge, .h-slide__title, .h-slide__desc, .h-slide__features li, .h-slide__cta'
                        );

                        gsap.set(targets, { opacity: 0, y: 30 });

                        if (i === 0) {
                            // First slide: reveal when section enters viewport
                            ScrollTrigger.create({
                                trigger: viewport,
                                start: 'top 80%',
                                onEnter: () => {
                                    gsap.to(targets, {
                                        opacity: 1, y: 0,
                                        duration: 0.8, stagger: 0.08,
                                        ease: 'power3.out'
                                    });
                                }
                            });
                        } else {
                            // Subsequent slides: tied to horizontal scroll position
                            ScrollTrigger.create({
                                trigger: slide,
                                containerAnimation: horizontalTween,
                                start: 'left center',
                                onEnter: () => {
                                    gsap.to(targets, {
                                        opacity: 1, y: 0,
                                        duration: 0.8, stagger: 0.08,
                                        ease: 'power3.out', overwrite: 'auto'
                                    });
                                },
                                onLeaveBack: () => {
                                    gsap.set(targets, { opacity: 0, y: 30 });
                                }
                            });
                        }
                    });
                }
                // Mobile (<769px): no ScrollTrigger — slides stack via CSS
            });
        });
    },

    /* --- PROJECT LIST HOVER REVEAL --- */
    setupProjectHover() {
        const preview = document.querySelector('.project-preview-container');
        const previewImg = document.querySelector('.project-preview-img');
        const items = document.querySelectorAll('.project-item');
        if (!preview || !previewImg || !items.length) return;

        // Smooth mouse-follow with lerp (works without GSAP too)
        let mouseX = 0, mouseY = 0;
        let currentX = 0, currentY = 0;
        let rafId = null;

        const lerp = (a, b, t) => a + (b - a) * t;

        const updatePosition = () => {
            currentX = lerp(currentX, mouseX, 0.12);
            currentY = lerp(currentY, mouseY, 0.12);
            preview.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
            rafId = requestAnimationFrame(updatePosition);
        };

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX - 200; // offset half of preview width (400/2)
            mouseY = e.clientY - 150; // offset slightly above cursor
        });

        items.forEach(item => {
            item.addEventListener('mouseenter', () => {
                const imgSrc = item.dataset.img;
                if (imgSrc) previewImg.src = imgSrc;

                preview.classList.add('active');

                if (typeof gsap !== 'undefined') {
                    gsap.to(preview, {
                        opacity: 1,
                        duration: 0.4,
                        ease: 'power3.out'
                    });
                } else {
                    preview.style.opacity = '1';
                }

                // Start animation loop
                if (!rafId) rafId = requestAnimationFrame(updatePosition);
            });

            item.addEventListener('mouseleave', () => {
                preview.classList.remove('active');

                if (typeof gsap !== 'undefined') {
                    gsap.to(preview, {
                        opacity: 0,
                        duration: 0.3,
                        ease: 'power2.in'
                    });
                } else {
                    preview.style.opacity = '0';
                }
            });
        });

        // Stop RAF when mouse leaves the entire section
        const casesSection = document.getElementById('cases');
        if (casesSection) {
            casesSection.addEventListener('mouseleave', () => {
                if (rafId) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                }
            });
        }
    },

    /* --- CONTACT TITLE REVEAL (fade + slide, no SplitType) --- */
    /* SplitType was removed because its inline-block char spans break
       background-clip:text on the parent h2.section-title, causing the
       gradient to render as solid blue boxes instead of clipped text.
       A simple whole-element animation preserves the gradient perfectly. */
    setupContactReveal() {
        const title = document.querySelector('.contact-title');
        if (!title || typeof gsap === 'undefined') return;

        gsap.set(title, { opacity: 0, y: 30 });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    gsap.to(title, {
                        opacity: 1,
                        y: 0,
                        duration: 0.8,
                        ease: 'power3.out'
                    });
                    observer.disconnect();
                }
            });
        }, { threshold: 0.1 });

        observer.observe(title);
    },

    /* --- PROCESS — Momento de Quebra (Neo-Minimalist 3D Cards) --- */
    setupProcessTimeline() {
        const section = document.getElementById('process');
        const cards = document.querySelectorAll('.process-card-3d');
        if (!section || !cards.length) return;
        if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

        // Reactor stays visible behind dark process section — no canvas fade, no header--light

        // 1. Zigzag Scroll Reveal — cards enter with alternating ±5deg rotation
        cards.forEach((card, i) => {
            const inner = card.querySelector('.card-3d-inner');
            if (!inner) return;

            // Alternating rotation: odd = +5deg, even = -5deg
            const zigzagRotation = i % 2 === 0 ? 5 : -5;

            // Set initial zigzag state
            gsap.set(inner, {
                opacity: 0,
                y: 40,
                rotation: zigzagRotation
            });

            ScrollTrigger.create({
                trigger: card,
                start: 'top 85%',
                onEnter: () => {
                    gsap.to(inner, {
                        opacity: 1, y: 0, rotation: 0,
                        duration: 1.0, delay: i * 0.1,
                        ease: 'power3.out'
                    });
                }
            });
        });

        // 3. Luxury 3D Tilt + Glare + Parallax Number + Grid Focus
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        if (!isMobile) {
            cards.forEach(card => {
                const inner = card.querySelector('.card-3d-inner');
                const number = card.querySelector('.process-number-neo');
                if (!inner) return;

                card.addEventListener('mousemove', (e) => {
                    const rect = card.getBoundingClientRect();
                    const x = (e.clientX - rect.left) / rect.width;
                    const y = (e.clientY - rect.top) / rect.height;

                    // 3D Tilt (max 10deg)
                    const tiltX = (y - 0.5) * -10;
                    const tiltY = (x - 0.5) * 10;
                    gsap.to(inner, { rotateX: tiltX, rotateY: tiltY, duration: 0.4, ease: 'power2.out' });

                    // Glare follows mouse
                    inner.style.setProperty('--glare-x', `${x * 100}%`);
                    inner.style.setProperty('--glare-y', `${y * 100}%`);

                    // Parallax on step number (moves opposite to mouse)
                    if (number) {
                        number.style.setProperty('--parallax-x', `${(x - 0.5) * -8}px`);
                        number.style.setProperty('--parallax-y', `${(y - 0.5) * -8}px`);
                    }
                });

                card.addEventListener('mouseenter', () => {
                    section.classList.add('grid-focus');
                });

                card.addEventListener('mouseleave', () => {
                    gsap.to(inner, { rotateX: 0, rotateY: 0, duration: 0.6, ease: 'power3.out' });
                    inner.style.setProperty('--glare-x', '50%');
                    inner.style.setProperty('--glare-y', '50%');
                    if (number) {
                        number.style.setProperty('--parallax-x', '0px');
                        number.style.setProperty('--parallax-y', '0px');
                    }
                    section.classList.remove('grid-focus');
                });
            });
        }
    },

    /* --- GALAXY SCROLL — Background color flow per section --- */
    setupCinematicScroll() {
        if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

        const processSection = document.getElementById('process');

        // ── Process: feed progress to scene for potential effects ──
        if (processSection) {
            ScrollTrigger.create({
                trigger: processSection,
                start: 'top 80%',
                end: 'bottom 20%',
                onUpdate: (self) => {
                    const scene = window.plexusScene;
                    if (scene) scene._processProgress = self.progress;
                },
                onLeave: () => {
                    const scene = window.plexusScene;
                    if (scene) scene._processProgress = 0;
                },
                onLeaveBack: () => {
                    const scene = window.plexusScene;
                    if (scene) scene._processProgress = 0;
                }
            });
        }
    },

    /* --- SPOTLIGHT MICRO-INTERACTION (Access + Process Cards) --- */
    setupSpotlight() {
        const cards = document.querySelectorAll('.access-card');
        if (!cards.length) return;

        cards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                card.style.setProperty('--spot-x', x + '%');
                card.style.setProperty('--spot-y', y + '%');
            });
        });
    },

    /* --- CONTACT PAGE FORM --- */
    setupContactForm() {
        const form = document.getElementById('contact-form');
        const formCard = document.getElementById('ct-form-card');
        const successOverlay = document.getElementById('ct-success');
        const resetBtn = document.getElementById('ct-reset');
        const submitBtn = document.getElementById('ct-submit');
        if (!form || !formCard) return;

        // Clear error state on input
        form.querySelectorAll('input, select, textarea').forEach(field => {
            field.addEventListener('input', () => {
                field.closest('.floating-field')?.classList.remove('floating-field--error');
            });
            field.addEventListener('change', () => {
                field.closest('.floating-field')?.classList.remove('floating-field--error');
            });
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Validate required fields
            let firstInvalid = null;
            form.querySelectorAll('[required]').forEach(field => {
                if (!field.checkValidity()) {
                    field.closest('.floating-field')?.classList.add('floating-field--error');
                    if (!firstInvalid) firstInvalid = field;
                }
            });

            if (firstInvalid) {
                firstInvalid.focus();
                return;
            }

            // Loading state
            if (submitBtn) {
                submitBtn.classList.add('btn--loading');
                submitBtn.disabled = true;
            }

            // Collect form data
            const formData = new FormData(form);
            const payload = Object.fromEntries(formData.entries());
            payload.source = 'contactos';

            try {
                await this.sendLead(payload);

                // Show success overlay
                if (successOverlay) {
                    successOverlay.classList.add('active');
                }
            } catch {
                alert('Erro ao enviar. Tente novamente ou contacte-nos por WhatsApp.');
            } finally {
                if (submitBtn) {
                    submitBtn.classList.remove('btn--loading');
                    submitBtn.disabled = false;
                }
            }
        });

        // Reset button — hide success, reset form
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (successOverlay) successOverlay.classList.remove('active');
                form.reset();
                // Clear any lingering error states
                form.querySelectorAll('.floating-field--error').forEach(f => {
                    f.classList.remove('floating-field--error');
                });
            });
        }
    },

    /* --- MAGNETIC BUTTON --- */
    setupMagneticButton() {
        // Original magnetic buttons (.btn--magnetic)
        const magneticBtns = document.querySelectorAll('.btn--magnetic');
        magneticBtns.forEach(btn => {
            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                btn.style.transform = `translate(${x * 0.25}px, ${y * 0.25}px)`;
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.transform = '';
            });
        });

        // Magnetic CTA: hero & slide CTA buttons follow mouse within 50px radius
        const ctaBtns = document.querySelectorAll('.hero__buttons .btn--primary, .h-slide__cta .btn');
        const RADIUS = 50;

        ctaBtns.forEach(btn => {
            btn.classList.add('btn--cta-magnetic');

            const onMove = (e) => {
                const rect = btn.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const distX = e.clientX - centerX;
                const distY = e.clientY - centerY;
                const dist = Math.sqrt(distX * distX + distY * distY);

                if (dist < RADIUS) {
                    // Within radius — button follows mouse proportionally
                    const strength = 1 - (dist / RADIUS);
                    const moveX = distX * strength * 0.4;
                    const moveY = distY * strength * 0.4;
                    btn.style.transform = `translate(${moveX}px, ${moveY}px)`;
                    btn.style.setProperty('--glow-intensity', (strength * 0.4).toFixed(2));
                    btn.classList.add('btn--cta-glow');
                } else {
                    btn.style.transform = '';
                    btn.style.setProperty('--glow-intensity', '0');
                }
            };

            const onLeave = () => {
                btn.style.transform = '';
            };

            // Listen on parent to catch proximity movement
            const parent = btn.closest('.hero__buttons') || btn.closest('.h-slide__cta');
            if (parent) {
                parent.addEventListener('mousemove', onMove, { passive: true });
                parent.addEventListener('mouseleave', onLeave);
            }
        });
    },

    /* --- BUTTON RIPPLE --- */
    setupRipple() {
        document.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const circle = document.createElement('span');
                circle.classList.add('ripple-effect');
                const rect = btn.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height);
                circle.style.width = circle.style.height = size + 'px';
                circle.style.left = (e.clientX - rect.left - size / 2) + 'px';
                circle.style.top = (e.clientY - rect.top - size / 2) + 'px';
                btn.appendChild(circle);
                circle.addEventListener('animationend', () => circle.remove());
            });
        });
    },

    /* --- FORMS --- */
    setupForms() {
        const form = document.getElementById('main-contact-form');
        const feedback = document.getElementById('form-feedback');

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = form.querySelector('button');
                const originalText = btn.textContent;
                
                btn.disabled = true;
                btn.textContent = '...';

                const formData = new FormData(form);
                const payload = Object.fromEntries(formData.entries());
                payload.source = 'homepage';

                try {
                    await this.sendLead(payload);

                    const t = this.state.translations.form;
                    feedback.textContent = t?.success || 'Enviado com sucesso!';
                    feedback.className = 'form-feedback success';
                    form.reset();
                } catch {
                    feedback.textContent = 'Erro ao enviar. Tente novamente.';
                    feedback.className = 'form-feedback error';
                }

                setTimeout(() => {
                    btn.disabled = false;
                    btn.textContent = originalText;
                    feedback.textContent = '';
                }, 5000);
            });
        }
    },

    async sendLead(payload) {
        const WEBHOOK_URL = 'https://n8n.branct.com/webhook/clientes?empresaId=1';
        try {
            const res = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (err) {
            console.error('Webhook error:', err);
            throw err;
        }
    }
};

// Start App
document.addEventListener('DOMContentLoaded', () => APP.init());
