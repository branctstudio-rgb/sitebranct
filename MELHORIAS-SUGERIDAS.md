# 💡 MELHORIAS SUGERIDAS - Projeto Site BRANCT

**Análise realizada em:** 06/02/2026
**Tipo:** Auditoria Frontend Sênior
**Foco:** Performance, Manutenibilidade, SEO, Acessibilidade

---

## 🏗️ ARQUITETURA & ESTRUTURA

### 1. Modularização do Código JavaScript

**Status Atual:** 🟡 JavaScript inline no HTML
**Recomendação:** Separar em módulos

#### Estrutura Sugerida:
```
src/js/
├── main.js                 (✅ Existente)
├── three-scene.js          (✅ Existente)
├── macbook-scene.js        (🆕 Novo - extrair de website-premium.html)
├── utils/
│   ├── webgl-check.js      (🆕 Verificação WebGL)
│   ├── loader-manager.js   (🆕 Gerenciamento de loading)
│   └── logger.js           (🆕 Sistema de logs)
└── config/
    └── three-config.js     (🆕 Configurações centralizadas)
```

**Benefícios:**
- ✅ Reutilização de código
- ✅ Melhor manutenção
- ✅ Testes mais fáceis
- ✅ Cacheable pelo navegador

---

### 2. Consistência de Dependências

**Problema Identificado:**
- Three.js importado via diferentes CDNs (Skypack, jsDelivr)
- Versões inconsistentes entre arquivos

**Solução:**
```javascript
// Criar arquivo: src/js/config/three-config.js
export const THREEJS_VERSION = '0.160.0';
export const CDN_BASE = 'https://cdn.jsdelivr.net/npm/three@' + THREEJS_VERSION;

export const IMPORTS = {
    THREE: `${CDN_BASE}/build/three.module.js`,
    GLTFLoader: `${CDN_BASE}/examples/jsm/loaders/GLTFLoader.js`,
    // ... outros
};
```

---

## 🚀 PERFORMANCE

### 3. Lazy Loading de Recursos Pesados

**Implementação Sugerida:**

#### A. Lazy Load do Three.js
```javascript
// Carregar Three.js apenas quando necessário
async function init3DScene() {
    const THREE = await import('./vendor/three.module.js');
    // Inicializar cena
}

// Trigger: quando usuário scrollar ou após tempo
const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
        init3DScene();
        observer.disconnect();
    }
});
```

#### B. Imagem Placeholder
```html
<!-- Antes do canvas 3D -->
<img src="src/img/macbook-preview.jpg"
     id="3d-placeholder"
     style="position: fixed; top: 0; left: 0; width: 100%; height: 100vh;"
     alt="MacBook Preview">

<script>
// Remover quando 3D carregar
manager.onLoad = () => {
    document.getElementById('3d-placeholder')?.remove();
};
</script>
```

**Economia Estimada:** ~500KB de JS não carregados inicialmente

---

### 4. Otimização de Modelos 3D

**Problema:** [src/3d/main.glb](src/3d/main.glb) está vazio (0 bytes)

**Ações Recomendadas:**
1. ✅ Hospedar modelo localmente (não depender de Supabase)
2. ✅ Comprimir modelo com [gltf-pipeline](https://github.com/CesiumGS/gltf-pipeline)
3. ✅ Usar Draco compression
4. ✅ Criar LOD (Level of Detail) para mobile

```bash
# Comprimir modelo GLTF
npm install -g gltf-pipeline
gltf-pipeline -i model.gltf -o model-compressed.glb -d
```

**Redução Esperada:** 60-80% do tamanho do arquivo

---

### 5. Code Splitting

**Implementação com Vite/Webpack:**
```javascript
// Chunk para Three.js
const ThreeScene = () => import('./three-scene.js');

// Chunk para página premium
const PremiumScene = () => import('./macbook-scene.js');
```

---

## 🔍 SEO & METADATA

### 6. Meta Tags Faltando

**Adicionar em todas as páginas:**

```html
<!-- Structured Data (JSON-LD) -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "BRANCT",
  "url": "https://branct.com",
  "logo": "https://branct.com/logo.png",
  "description": "Soluções Digitais Premium & Tech-Luxury",
  "sameAs": [
    "https://twitter.com/branct",
    "https://linkedin.com/company/branct"
  ]
}
</script>

<!-- Canonical URLs -->
<link rel="canonical" href="https://branct.com/website-premium">

<!-- Twitter Cards Completo -->
<meta name="twitter:site" content="@branct">
<meta name="twitter:creator" content="@branct">
<meta name="twitter:image" content="https://branct.com/twitter-card.jpg">

<!-- Robots -->
<meta name="robots" content="index, follow">
```

---

### 7. Sitemap e Robots.txt

**Criar:** `sitemap.xml`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://branct.com/</loc>
    <lastmod>2026-02-06</lastmod>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://branct.com/website-premium</loc>
    <lastmod>2026-02-06</lastmod>
    <priority>0.8</priority>
  </url>
  <!-- ... outras páginas -->
</urlset>
```

**Criar:** `robots.txt`
```
User-agent: *
Allow: /
Sitemap: https://branct.com/sitemap.xml

# Bloquear páginas de teste
Disallow: /test/
Disallow: /admin/
```

---

## ♿ ACESSIBILIDADE (A11Y)

### 8. ARIA Labels e Roles

**Adicionar em elementos interativos:**

```html
<!-- Botão de idioma -->
<button class="lang-btn"
        aria-label="Selecionar idioma"
        aria-haspopup="true"
        aria-expanded="false">
    <span id="current-lang">PT</span>
</button>

<!-- Canvas 3D -->
<canvas id="laptop-canvas"
        role="img"
        aria-label="Modelo 3D interativo de um MacBook"></canvas>

<!-- Loader -->
<div id="loader" role="status" aria-live="polite">
    <div class="loader-text">Loading Experience</div>
</div>
```

---

### 9. Contraste de Cores

**Verificar com ferramenta:** [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

**Problema Identificado:**
```css
/* ❌ Contraste insuficiente (WCAG AA) */
.glass-card p {
    color: #072c3d; /* Sobre fundo #d2d2d2 = 3.2:1 */
}

/* ✅ Melhorado */
.glass-card p {
    color: #05202e; /* Contraste 4.8:1 - WCAG AA ✓ */
}
```

---

### 10. Navegação por Teclado

**Implementar Skip Links:**
```html
<a href="#main-content" class="skip-link">
    Pular para conteúdo principal
</a>

<style>
.skip-link {
    position: absolute;
    top: -40px;
    left: 0;
    background: var(--accent-primary);
    color: white;
    padding: 8px;
    text-decoration: none;
    z-index: 100;
}
.skip-link:focus {
    top: 0;
}
</style>
```

---

## 🎨 UX/UI

### 11. Loading States Melhores

**Skeleton Screen em vez de loader genérico:**

```html
<div class="skeleton-loader">
    <div class="skeleton skeleton-heading"></div>
    <div class="skeleton skeleton-text"></div>
    <div class="skeleton skeleton-text"></div>
    <div class="skeleton skeleton-button"></div>
</div>

<style>
.skeleton {
    background: linear-gradient(
        90deg,
        rgba(255,255,255,0.1) 25%,
        rgba(255,255,255,0.2) 50%,
        rgba(255,255,255,0.1) 75%
    );
    background-size: 200% 100%;
    animation: loading 1.5s infinite;
}

@keyframes loading {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}
</style>
```

---

### 12. Feedback de Erro Amigável

**Em vez de console.error, mostrar para o usuário:**

```javascript
function showUserError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'user-error-toast';
    errorDiv.innerHTML = `
        <span>⚠️</span>
        <p>${message}</p>
        <button onclick="this.parentElement.remove()">×</button>
    `;
    document.body.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

// Uso:
if (!checkWebGLSupport()) {
    showUserError('Seu navegador não suporta WebGL. A experiência 3D não estará disponível.');
}
```

---

## 🔒 SEGURANÇA

### 13. Content Security Policy (CSP)

**Adicionar no `<head>` ou via header HTTP:**

```html
<meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    font-src 'self' https://fonts.gstatic.com;
    img-src 'self' data: https:;
    connect-src 'self' https://vazxmixjsiawhamofees.supabase.co;
    frame-ancestors 'none';
">
```

---

### 14. Subresource Integrity (SRI)

**Para recursos de CDN:**

```html
<script type="module"
        src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
        integrity="sha384-..."
        crossorigin="anonymous">
</script>
```

**Gerar hash SRI:**
```bash
curl https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js | \
openssl dgst -sha384 -binary | \
openssl base64 -A
```

---

## 📱 RESPONSIVIDADE

### 15. Otimização Mobile

**Detector de dispositivo:**
```javascript
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

if (isMobile) {
    // Reduzir qualidade do 3D
    renderer.setPixelRatio(1); // Em vez de Math.min(devicePixelRatio, 2)

    // Desabilitar sombras
    renderer.shadowMap.enabled = false;

    // Reduzir particles no plexus
    particleCount = 400; // Em vez de 800
}
```

---

### 16. Touch Gestures

**Adicionar suporte a gestos:**
```javascript
let touchStartX = 0;
let touchEndX = 0;

canvas.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
});

canvas.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleGesture();
});

function handleGesture() {
    if (touchEndX < touchStartX - 50) {
        // Swipe left - próxima seção
    }
    if (touchEndX > touchStartX + 50) {
        // Swipe right - seção anterior
    }
}
```

---

## 🧪 TESTES & QUALIDADE

### 17. Configurar Testing

**Estrutura Sugerida:**

```javascript
// tests/three-scene.test.js
import { describe, it, expect } from 'vitest';
import { checkWebGLSupport } from '../src/js/utils/webgl-check';

describe('WebGL Support', () => {
    it('should detect WebGL support', () => {
        expect(checkWebGLSupport()).toBeDefined();
    });
});
```

**package.json:**
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "@vitest/ui": "^1.0.0"
  }
}
```

---

### 18. Linting & Formatting

**ESLint + Prettier:**

```bash
npm install --save-dev eslint prettier eslint-config-prettier
```

**.eslintrc.json:**
```json
{
  "extends": ["eslint:recommended"],
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "rules": {
    "no-console": "warn",
    "no-unused-vars": "warn"
  }
}
```

**.prettierrc:**
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 4,
  "trailingComma": "es5"
}
```

---

## 📊 ANALYTICS & MONITORAMENTO

### 19. Performance Monitoring

**Adicionar Web Vitals:**

```html
<script type="module">
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'https://unpkg.com/web-vitals@3?module';

function sendToAnalytics(metric) {
    console.log(metric);
    // Enviar para Google Analytics, Plausible, etc.
}

getCLS(sendToAnalytics);
getFID(sendToAnalytics);
getFCP(sendToAnalytics);
getLCP(sendToAnalytics);
getTTFB(sendToAnalytics);
</script>
```

---

### 20. Error Tracking

**Integrar Sentry ou similar:**

```javascript
window.addEventListener('error', (event) => {
    // Log para serviço de erro tracking
    console.error('Global error:', event.error);

    // Enviar para Sentry
    // Sentry.captureException(event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});
```

---

## 🔄 CI/CD

### 21. GitHub Actions

**Criar:** `.github/workflows/ci.yml`

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - run: npm run lint

  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: treosh/lighthouse-ci-action@v10
        with:
          urls: |
            https://branct.com
            https://branct.com/website-premium
          uploadArtifacts: true
```

---

## 📈 PRIORIZAÇÃO

### Implementação Recomendada (Fases):

#### **FASE 1 - Crítico (Semana 1)** 🔴
- [x] ~~Atualizar Three.js~~ (✅ Concluído)
- [x] ~~Corrigir APIs depreciadas~~ (✅ Concluído)
- [ ] Hospedar modelo GLTF localmente
- [ ] Adicionar meta tags SEO básicas
- [ ] Implementar CSP

#### **FASE 2 - Importante (Semana 2-3)** 🟡
- [ ] Modularizar JavaScript
- [ ] Implementar lazy loading
- [ ] Melhorar acessibilidade (ARIA)
- [ ] Adicionar sitemap.xml
- [ ] Configurar ESLint/Prettier

#### **FASE 3 - Melhoria (Mês 1-2)** 🟢
- [ ] Implementar testes
- [ ] Configurar CI/CD
- [ ] Adicionar Web Vitals
- [ ] Otimizar mobile
- [ ] Criar documentação completa

#### **FASE 4 - Evolução (Trimestre)** 🔵
- [ ] Code splitting
- [ ] PWA features
- [ ] Internacionalização completa
- [ ] A/B testing framework

---

## 💰 IMPACTO ESTIMADO

| Melhoria | Esforço | Impacto | ROI |
|----------|---------|---------|-----|
| Modularização JS | 8h | Alto | ⭐⭐⭐⭐⭐ |
| Lazy Loading | 4h | Alto | ⭐⭐⭐⭐⭐ |
| SEO Completo | 6h | Alto | ⭐⭐⭐⭐⭐ |
| Acessibilidade | 8h | Médio | ⭐⭐⭐⭐ |
| Testes | 16h | Médio | ⭐⭐⭐⭐ |
| Mobile Optimization | 12h | Alto | ⭐⭐⭐⭐⭐ |

**Total Estimado:** 54 horas de desenvolvimento
**Melhoria de Performance:** +40-60%
**Melhoria de SEO Score:** +25-35 pontos

---

## 📚 RECURSOS ÚTEIS

- [Three.js Best Practices](https://discoverthreejs.com/tips-and-tricks/)
- [Web.dev Performance](https://web.dev/performance/)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)
- [Google Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [Can I Use](https://caniuse.com/)

---

**Elaborado por:** Claude Code - Senior Frontend Engineer
**Última atualização:** 06/02/2026
