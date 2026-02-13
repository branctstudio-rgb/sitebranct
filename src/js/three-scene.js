// Three.js r170 — Data Galaxy Scene (Neon Noir Immersive Background)
// Concept: Vast 3D galaxy with star field, constellation lines, nebula atmosphere
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * BRANCT.Tech | DataGalaxyScene
 * Immersive background: 15 000 stars + 2 000 constellation lines + nebula planes + bloom
 * Bridge API: scrollProgress, targetColor, scrollActive (compatible with PlexusScene)
 */
class DataGalaxyScene {
    constructor() {
        this.canvas = document.querySelector('#webgl-canvas');
        if (!this.canvas) {
            console.error('WebGL canvas not found!');
            return;
        }

        this.scene    = new THREE.Scene();
        this.camera   = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 5000);
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: false,
            antialias: false,
            powerPreference: 'high-performance'
        });

        this.composer = null;
        this.clock    = new THREE.Clock();

        /* ── Bridge API (backward-compatible with PlexusScene) ── */
        this.mouse          = new THREE.Vector2(0, 0);
        this.targetRotation = new THREE.Vector2();
        this.scrollProgress = 0;
        this.targetColor    = new THREE.Color('#00fff2');
        this.scrollActive   = false;
        this._processProgress = 0;

        /* ── Internal state ── */
        this._frameCount  = 0;
        this._galaxyGroup = null;

        /* ── Scene objects ── */
        this.starField          = null;
        this.constellationLines = null;
        this.nebulaPlanes       = [];
        this.bloomPass          = null;

        /* ── Theme state ── */
        this._theme = 'dark';

        /* ── Camera parallax ── */
        this._cameraBasePos = new THREE.Vector3(0, 0, 800);
        this._cameraTarget  = new THREE.Vector3(0, 0, 0);
        this._parallaxMult  = 160; // Mouse parallax range — reactive

        /* ── Animation ── */
        this._animate = this.animate.bind(this);
        this._rafId   = null;

        this.init();
    }

    init() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.setClearColor(0x020508, 1);
        this.scene.background = new THREE.Color(0x020508);

        // Camera setup — positioned inside the galaxy volume
        this.camera.position.copy(this._cameraBasePos);
        this.camera.lookAt(this._cameraTarget);

        // Exponential fog — very subtle, just hides the far horizon
        this.scene.fog = new THREE.FogExp2(0x020508, 0.0002);

        this._buildScene();

        // Events
        this._resizeTimer = null;
        this._onResize = () => {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(() => this._handleResize(), 150);
        };
        this._onMouseMove = this._handleMouseMove.bind(this);
        window.addEventListener('resize', this._onResize);
        window.addEventListener('mousemove', this._onMouseMove, { passive: true });

        this._rafId = requestAnimationFrame(this._animate);

        // Pause when tab hidden
        this._onVisibilityChange = () => {
            if (document.hidden) {
                if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
                this.clock.stop();
            } else {
                if (!this._rafId) { this.clock.start(); this._rafId = requestAnimationFrame(this._animate); }
            }
        };
        document.addEventListener('visibilitychange', this._onVisibilityChange);

        this._playIntro();
    }

    /* ═══════════════════════════════════════════════════════════
       Build Scene
       ═══════════════════════════════════════════════════════════ */
    _buildScene() {
        this._galaxyGroup = new THREE.Group();
        this.scene.add(this._galaxyGroup);

        this._buildStarField();
        this._buildConstellations();
        this._buildNebulae();
        this._buildComposer();
    }

    /* ═══════════════════════════════════════════════════════════
       Layer 1: Star Field — 15 000 points in 4000³ volume
       ═══════════════════════════════════════════════════════════ */
    _buildStarField() {
        const COUNT = 15000;
        const SPREAD = 4000;
        const geo = new THREE.BufferGeometry();

        const positions = new Float32Array(COUNT * 3);
        const sizes     = new Float32Array(COUNT);
        const alphas    = new Float32Array(COUNT);
        const twinkleOffsets = new Float32Array(COUNT);

        for (let i = 0; i < COUNT; i++) {
            const i3 = i * 3;
            positions[i3]     = (Math.random() - 0.5) * SPREAD;
            positions[i3 + 1] = (Math.random() - 0.5) * SPREAD;
            positions[i3 + 2] = (Math.random() - 0.5) * SPREAD;

            // Varied sizes: mostly small, occasional bright stars
            const rnd = Math.random();
            if (rnd > 0.993) {
                sizes[i] = 8 + Math.random() * 6;     // Bright giants
            } else if (rnd > 0.96) {
                sizes[i] = 4 + Math.random() * 4;     // Medium stars
            } else {
                sizes[i] = 1.0 + Math.random() * 3;   // Dim stars
            }

            alphas[i] = 0.3 + Math.random() * 0.7;
            twinkleOffsets[i] = Math.random() * Math.PI * 2;
        }

        geo.setAttribute('position',      new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('size',           new THREE.BufferAttribute(sizes, 1));
        geo.setAttribute('alpha',          new THREE.BufferAttribute(alphas, 1));
        geo.setAttribute('twinkleOffset',  new THREE.BufferAttribute(twinkleOffsets, 1));

        const tex = this._generateSparkleTexture();

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uColor:     { value: new THREE.Color('#00fff2') },
                uWhite:     { value: new THREE.Color('#ffffff') },
                uMap:       { value: tex },
                uTime:      { value: 0 },
                uColorMix:  { value: 0.3 } // 30% cyan tint, 70% white
            },
            vertexShader: /* glsl */`
                attribute float size;
                attribute float alpha;
                attribute float twinkleOffset;

                uniform float uTime;

                varying float vAlpha;
                varying float vTwinkle;

                void main() {
                    vAlpha = alpha;

                    // Twinkle: slow sin wave per star
                    vTwinkle = 0.6 + 0.4 * sin(uTime * 0.5 + twinkleOffset);

                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

                    // Size attenuation (closer = bigger)
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_PointSize = clamp(gl_PointSize, 0.5, 12.0);

                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: /* glsl */`
                uniform vec3 uColor;
                uniform vec3 uWhite;
                uniform sampler2D uMap;
                uniform float uColorMix;

                varying float vAlpha;
                varying float vTwinkle;

                void main() {
                    vec4 tex = texture2D(uMap, gl_PointCoord);
                    vec3 color = mix(uWhite, uColor, uColorMix);
                    float a = tex.a * vAlpha * vTwinkle;
                    if (a < 0.01) discard;
                    gl_FragColor = vec4(color * tex.rgb, a);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.starField = new THREE.Points(geo, mat);
        this._galaxyGroup.add(this.starField);
    }

    /* ═══════════════════════════════════════════════════════════
       Layer 2: Constellation Lines — 2 000 pre-calculated segments
       ═══════════════════════════════════════════════════════════ */
    _buildConstellations() {
        const SEGMENTS = 2000;
        const SPREAD   = 3000;
        const MIN_LEN  = 30;
        const MAX_LEN  = 250;

        const positions = new Float32Array(SEGMENTS * 2 * 3); // 2 vertices per segment
        const alphas    = new Float32Array(SEGMENTS * 2);

        for (let i = 0; i < SEGMENTS; i++) {
            const i6 = i * 6;
            const i2 = i * 2;

            // Random start point
            const x1 = (Math.random() - 0.5) * SPREAD;
            const y1 = (Math.random() - 0.5) * SPREAD;
            const z1 = (Math.random() - 0.5) * SPREAD;

            // Random direction + length for end point
            const len   = MIN_LEN + Math.random() * (MAX_LEN - MIN_LEN);
            const theta = Math.random() * Math.PI * 2;
            const phi   = Math.acos(2 * Math.random() - 1);

            const dx = len * Math.sin(phi) * Math.cos(theta);
            const dy = len * Math.sin(phi) * Math.sin(theta);
            const dz = len * Math.cos(phi);

            positions[i6]     = x1;
            positions[i6 + 1] = y1;
            positions[i6 + 2] = z1;
            positions[i6 + 3] = x1 + dx;
            positions[i6 + 4] = y1 + dy;
            positions[i6 + 5] = z1 + dz;

            // Both ends get matched alpha — visible cyan lines
            const a = 0.15 + Math.random() * 0.25;
            alphas[i2]     = a;
            alphas[i2 + 1] = a;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('alpha',    new THREE.BufferAttribute(alphas, 1));

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color('#00fff2') },
                uTime:  { value: 0 }
            },
            vertexShader: /* glsl */`
                attribute float alpha;
                varying float vAlpha;
                void main() {
                    vAlpha = alpha;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */`
                uniform vec3 uColor;
                uniform float uTime;
                varying float vAlpha;
                void main() {
                    // Subtle pulse
                    float pulse = 0.8 + 0.2 * sin(uTime * 0.3 + vAlpha * 100.0);
                    gl_FragColor = vec4(uColor, vAlpha * pulse);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.constellationLines = new THREE.LineSegments(geo, mat);
        this._galaxyGroup.add(this.constellationLines);
    }

    /* ═══════════════════════════════════════════════════════════
       Layer 3: Nebula Atmosphere — 8 semi-transparent planes
       Procedural smoke/cloud textures (no external images)
       ═══════════════════════════════════════════════════════════ */
    _buildNebulae() {
        const NEBULA_COUNT = 8;

        for (let i = 0; i < NEBULA_COUNT; i++) {
            const tex  = this._generateNebulaTexture(i);
            const size = 600 + Math.random() * 1200;
            const geo  = new THREE.PlaneGeometry(size, size);

            const mat = new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide,
                opacity: 0.03 + Math.random() * 0.04
            });

            const mesh = new THREE.Mesh(geo, mat);

            // Place at random positions within galaxy volume
            mesh.position.set(
                (Math.random() - 0.5) * 2500,
                (Math.random() - 0.5) * 2500,
                (Math.random() - 0.5) * 2500
            );

            // Random orientation
            mesh.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );

            // Store base rotation speeds for animation
            mesh.userData.rotSpeed = {
                x: (Math.random() - 0.5) * 0.0003,
                y: (Math.random() - 0.5) * 0.0003,
                z: (Math.random() - 0.5) * 0.0002
            };

            this.nebulaPlanes.push(mesh);
            this._galaxyGroup.add(mesh);
        }
    }

    /* ═══════════════════════════════════════════════════════════
       Procedural Textures
       ═══════════════════════════════════════════════════════════ */
    _generateSparkleTexture() {
        const size = 64;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');

        // Soft radial glow with a bright core
        const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.15, 'rgba(255,255,255,0.8)');
        g.addColorStop(0.4, 'rgba(200,240,255,0.2)');
        g.addColorStop(1, 'rgba(200,240,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);

        const t = new THREE.Texture(c);
        t.needsUpdate = true;
        return t;
    }

    _generateNebulaTexture(seed) {
        const size = 256;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        const imgData = ctx.createImageData(size, size);
        const data = imgData.data;

        // Simple procedural noise — layered random circles for cloud-like effect
        // Seeded pseudo-random for variety
        const _rand = () => {
            seed = (seed * 16807 + 0) % 2147483647;
            return (seed & 0x7fffffff) / 0x7fffffff;
        };

        // Start with empty
        for (let i = 0; i < data.length; i += 4) {
            data[i] = data[i + 1] = data[i + 2] = 0;
            data[i + 3] = 0;
        }

        // Scatter soft radial blobs
        const blobs = 15 + Math.floor(_rand() * 15);
        const cx = size / 2, cy = size / 2;

        for (let b = 0; b < blobs; b++) {
            const bx = cx + (_rand() - 0.5) * size * 0.6;
            const by = cy + (_rand() - 0.5) * size * 0.6;
            const br = 30 + _rand() * 80;
            const intensity = 20 + _rand() * 40;

            // Neon tint: cyan-ish with slight variation
            const r = Math.floor(0 + _rand() * 30);
            const g = Math.floor(180 + _rand() * 75);
            const bCol = Math.floor(200 + _rand() * 55);

            for (let py = Math.max(0, Math.floor(by - br)); py < Math.min(size, Math.ceil(by + br)); py++) {
                for (let px = Math.max(0, Math.floor(bx - br)); px < Math.min(size, Math.ceil(bx + br)); px++) {
                    const dx = px - bx;
                    const dy = py - by;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > br) continue;

                    const falloff = 1.0 - (dist / br);
                    const alpha = Math.floor(falloff * falloff * intensity);

                    const idx = (py * size + px) * 4;
                    // Additive blending in texture
                    data[idx]     = Math.min(255, data[idx] + Math.floor(r * falloff));
                    data[idx + 1] = Math.min(255, data[idx + 1] + Math.floor(g * falloff * 0.5));
                    data[idx + 2] = Math.min(255, data[idx + 2] + Math.floor(bCol * falloff * 0.5));
                    data[idx + 3] = Math.min(255, data[idx + 3] + alpha);
                }
            }
        }

        // Radial vignette — fade edges to transparent
        for (let py = 0; py < size; py++) {
            for (let px = 0; px < size; px++) {
                const dx = px - cx;
                const dy = py - cy;
                const dist = Math.sqrt(dx * dx + dy * dy) / (size * 0.5);
                const vignette = Math.max(0, 1.0 - dist * dist);
                const idx = (py * size + px) * 4;
                data[idx + 3] = Math.floor(data[idx + 3] * vignette);
            }
        }

        ctx.putImageData(imgData, 0, 0);

        const t = new THREE.Texture(c);
        t.needsUpdate = true;
        return t;
    }

    /* ═══════════════════════════════════════════════════════════
       Bloom Post-Processing
       ═══════════════════════════════════════════════════════════ */
    _buildComposer() {
        try {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));
            this.bloomPass = new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth, window.innerHeight),
                0.6,    // strength — subtle glow on bright stars
                1.2,    // radius — wide diffuse halo
                0.3     // threshold — only bright elements bloom
            );
            this.bloomPass.renderToScreen = true;
            this.composer.addPass(this.bloomPass);
        } catch (e) {
            console.warn('Bloom not supported:', e.message);
            this.composer = null;
        }
    }

    /* ═══════════════════════════════════════════════════════════
       Events
       ═══════════════════════════════════════════════════════════ */
    _handleMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        this.targetRotation.x = (event.clientX / window.innerWidth - 0.5);
        this.targetRotation.y = (event.clientY / window.innerHeight - 0.5);
    }

    _handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        if (this.composer) this.composer.setSize(window.innerWidth, window.innerHeight);
    }

    _playIntro() {
        window.__plexusReady = true;
        window.dispatchEvent(new CustomEvent('plexus-ready'));
        if (this.canvas) this.canvas.style.opacity = '1';
    }

    /* ═══════════════════════════════════════════════════════════
       Theme Adaptation — Light / Dark mode
       ═══════════════════════════════════════════════════════════ */
    adaptToTheme(theme) {
        this._theme = theme;
        const isLight = theme === 'light';

        /* ── Scene background & fog ── */
        const bgColor = isLight ? 0xf0f2f5 : 0x020508;
        this.scene.background = new THREE.Color(bgColor);
        this.renderer.setClearColor(bgColor, 1);
        if (this.scene.fog) {
            this.scene.fog.color.set(bgColor);
            this.scene.fog.density = isLight ? 0.00015 : 0.0002;
        }

        /* ── Stars ── */
        if (this.starField) {
            const su = this.starField.material.uniforms;
            su.uColor.value.set(isLight ? '#097697' : '#00fff2');
            su.uWhite.value.set(isLight ? '#6a7a8a' : '#ffffff');
            su.uColorMix.value = isLight ? 0.4 : 0.3;
        }

        /* ── Constellation lines ── */
        if (this.constellationLines) {
            this.constellationLines.material.uniforms.uColor.value.set(
                isLight ? '#097697' : '#00fff2'
            );
        }

        /* ── Nebula planes — reduce opacity in light ── */
        for (const neb of this.nebulaPlanes) {
            neb.material.opacity = isLight ? 0.01 : 0.03 + Math.random() * 0.04;
            neb.material.needsUpdate = true;
        }

        /* ── Bloom — softer in light to avoid washout ── */
        if (this.bloomPass) {
            this.bloomPass.strength  = isLight ? 0.2 : 0.6;
            this.bloomPass.radius    = isLight ? 0.5 : 1.2;
            this.bloomPass.threshold = isLight ? 0.6 : 0.3;
        }

        /* ── Canvas visibility ── */
        if (this.canvas) {
            this.canvas.style.transition = 'opacity 0.5s ease';
            this.canvas.style.opacity = '1'; // Keep visible in both themes
        }
    }

    /* ═══════════════════════════════════════════════════════════
       Render Loop
       ═══════════════════════════════════════════════════════════ */
    animate() {
        this._rafId = requestAnimationFrame(this._animate);
        this._frameCount++;

        const delta   = Math.min(this.clock.getDelta(), 0.05);
        const elapsed = this.clock.getElapsedTime();

        /* ── Camera parallax (mouse) — responsive ── */
        const targetX = this._cameraBasePos.x + this.targetRotation.x * this._parallaxMult;
        const targetY = this._cameraBasePos.y + this.targetRotation.y * this._parallaxMult * 0.6;
        this.camera.position.x += (targetX - this.camera.position.x) * 0.035;
        this.camera.position.y += (targetY - this.camera.position.y) * 0.035;
        this.camera.lookAt(this._cameraTarget);

        /* ── Galaxy rotation — visible movement ── */
        if (this._galaxyGroup) {
            this._galaxyGroup.rotation.y += 0.0008;
            this._galaxyGroup.rotation.z += 0.0002;
        }

        /* ── Stars — wave + twinkle ── */
        if (this.starField) {
            const su = this.starField.material.uniforms;
            su.uTime.value = elapsed;

            // Vertical wave drift — stars gently undulate
            this.starField.position.y = Math.sin(elapsed * 0.15) * 15;

            // Color flow from bridge: tint stars
            su.uColor.value.lerp(this.targetColor, 0.01);
        }

        /* ── Constellation lines ── */
        if (this.constellationLines) {
            const cu = this.constellationLines.material.uniforms;
            cu.uTime.value = elapsed;
            cu.uColor.value.lerp(this.targetColor, 0.01);
        }

        /* ── Nebula planes: gentle drift ── */
        for (let i = 0; i < this.nebulaPlanes.length; i++) {
            const neb = this.nebulaPlanes[i];
            const rs = neb.userData.rotSpeed;
            neb.rotation.x += rs.x;
            neb.rotation.y += rs.y;
            neb.rotation.z += rs.z;
        }

        /* ── Fog color sync — theme-aware ── */
        if (this.scene.fog && this._theme === 'dark') {
            const fogBase = new THREE.Color(0x020508);
            this.scene.fog.color.copy(fogBase).lerp(this.targetColor, 0.005);
            this.renderer.setClearColor(this.scene.fog.color);
        }

        /* ── Render ── */
        if (this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /* ═══════════════════════════════════════════════════════════
       Dispose — Clean up all GPU resources
       ═══════════════════════════════════════════════════════════ */
    dispose() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._rafId = null;

        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('visibilitychange', this._onVisibilityChange);

        this.scene.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => this._disposeMaterial(m));
                } else {
                    this._disposeMaterial(obj.material);
                }
            }
        });

        if (this.composer) {
            this.composer.passes.forEach(p => p.dispose?.());
            this.composer.dispose();
        }

        this.renderer.dispose();
        this.renderer.forceContextLoss();
    }

    _disposeMaterial(mat) {
        for (const key of Object.keys(mat)) {
            const val = mat[key];
            if (val && typeof val.dispose === 'function') {
                val.dispose();
            }
        }
        if (mat.uniforms) {
            for (const u of Object.values(mat.uniforms)) {
                if (u.value && typeof u.value.dispose === 'function') {
                    u.value.dispose();
                }
            }
        }
        mat.dispose();
    }
}

/* ═══════════════════════════════════════════════════════════
   Bootstrap
   ═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    const isMobile = window.innerWidth < 768 ||
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobile) {
        // Mobile: CSS gradient fallback — no Three.js
        const canvas = document.querySelector('#webgl-canvas');
        if (canvas) canvas.style.display = 'none';

        const gradBg = document.createElement('div');
        gradBg.classList.add('mobile-gradient-bg');
        document.body.prepend(gradBg);

        window.__plexusReady = true;
        window.dispatchEvent(new CustomEvent('plexus-ready'));
    } else {
        window.plexusScene = new DataGalaxyScene();
    }
});
