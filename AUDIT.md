# AUDIT.md — Auditoria pré-redesign "Premium Light 2026"
*Fase 0 do redesign · 2026-06-11 · Claude Code (design engineer BRANCT)*

Objetivo: inventariar o site atual, decidir o que **fica**, o que **sai** e o que **falta**, antes de escrever uma linha do novo design.

---

## 1. Estado atual (resumo)

- HTML estático servido por FTP → Hostinger (`.github/workflows/deploy.yml`, push em `main` → `/domains/branct.com/public_html/`). Sem build step.
- Tema dark "tech-luxury": Three.js no hero (`src/js/three-scene.js` + 3 modelos `.glb`), GSAP + ScrollTrigger + SplitType via CDN, scroll horizontal de serviços, preloader com barra de progresso.
- `crm-gestao.html` é **standalone** (CSS inline próprio, Pixel próprio, consent banner próprio) — decisão correta, mantém-se standalone no redesign.
- i18n PT/EN/IT/HR via `data-i18n` + `src/i18n/*.json` (~29KB cada), carregado em runtime pelo `main.js`.
- Leads dos formulários (home + contactos) → **webhook n8n** `https://n8n.branct.com/webhook/site-lead` (com token estático no JS).
- Trial do CRM: form em `crm-gestao.html` → `trial.js` → redirect para `app.branct.com/signup` com `?trial=true&name&email&company` + UTMs + `ref` + `lead_eventid` + `consent`. Password nunca passa pela landing.

## 2. Peso atual (o problema)

| Item | Peso | Veredicto |
|---|---|---|
| `src/img/video.mp4` | 16,9 MB | **SAI** (estava staged, não commitado — unstaged nesta fase; ficheiro mantido em disco) |
| `src/models/2.glb` + `macbook.glb` + `macbookout.glb` | 22,5 MB | **SAEM** com o Three.js |
| `src/3d/main.glb` | 0 KB (vazio/órfão) | **SAI** |
| `src/img/*.jpg` (website, crm, automacao, 56…) | 0,6–0,7 MB cada | **Converter** para AVIF/WebP + srcset |
| `src/css/main.css` | 75 KB | **Substituído** pelo novo design system (CSS crítico inline + folha pequena) |
| `src/js/main.js` | 50 KB | **Reescrito** — sai preloader, magnetic buttons, ripple, 3D tilt, scroll horizontal; fica i18n, drawer, forms |
| `src/js/three-scene.js` | 28 KB | **SAI** |
| GSAP + ScrollTrigger + SplitType + Three.js (CDN) | ~700 KB de JS | **SAEM** — motion passa a CSS + IntersectionObserver (~3 KB) |

Total `src/`: 42,3 MB → alvo pós-redesign: **< 3 MB** (imagens otimizadas incluídas).

## 3. O que FICA (intocável ou quase)

1. **URLs** — todas as páginas mantêm o nome de ficheiro. `crm-gestao.html` é destino de campanha Meta ativa: **não parte, não redireciona, não muda de nome**.
2. **Tracking do funil** (regra de ouro já documentada no CLAUDE.md):
   - Pixel `1595310191130205`, init **só após consent** (banner RGPD, `localStorage['branct_consent']` v1)
   - Landing dispara só `ViewContent` (form ≥50% visível, 1×) e `Lead` (1×, submit, com `eventID` UUID em `sessionStorage['branct_lead_eventid']`)
   - **Landing NUNCA dispara `StartTrial`** — é exclusivo de `app.branct.com/signup`
   - Redirect preserva UTMs + `ref` + `lead_eventid` + `consent=1`
   - [src/js/trial.js](src/js/trial.js) **mantém-se sem alterações de lógica** (só o HTML/CSS do form à volta muda)
3. **i18n** — sistema `data-i18n` + `src/i18n/{pt,en,it,hr}.json`. PT default. As chaves existentes são reaproveitadas; chaves novas adicionadas nos 4 ficheiros.
4. **Webhook n8n de leads** (`sendLead()` em main.js) — endpoint e payload mantidos nos forms da agência.
5. **Consent banner** RGPD (lógica) — re-estilizado para light, mesma chave/versão (`branct_consent` v1) para não re-pedir consentimento a quem já decidiu.
6. **`facebook-domain-verification`** meta tag — fica em todas as páginas que a têm.
7. **Supabase** `functions/trial-signup` + migration — **órfãos por decisão** (ver CLAUDE.md); não tocar nesta fase, remoção só depois do novo fluxo validado em produção.
8. **Deploy FTP** — workflow mantém-se; acrescentar exclusões para ficheiros de design/docs novos se necessário.

## 4. O que SAI

- Three.js, importmap, `three-scene.js`, modelos `.glb`, canvas WebGL, overlay gradient
- GSAP + ScrollTrigger + SplitType (CDN) — todo o motion passa a CSS transitions/keyframes + IntersectionObserver
- Preloader "light curtain" com percentagem (custa LCP, não acrescenta nada)
- Scroll horizontal de serviços (hostil em mobile, pesado, esconde conteúdo)
- Magnetic buttons, ripple, 3D tilt cards, spotlight cards (decoração sem significado)
- Theme toggle dark/light — o site passa a ser **light only** (dark fica apenas dentro dos screenshots do produto)
- `express` e `three` do `package.json` (declarados, nunca usados no site servido)
- Mojibake nos textos PT de `servicos.html`/`blog.html` (corrigir ao reescrever)

## 5. O que FALTA (gaps que o redesign tem de criar)

| Gap | Estado atual | Ação |
|---|---|---|
| **Cloudflare Turnstile** | **Não existe em nenhum form** (o handoff de marketing assume que existe) | Adicionar aos forms de contacto/lead. Requer site key — **pedir ao Felipe** ou criar no painel Cloudflare. O webhook n8n terá de validar o token server-side |
| **schema.org JSON-LD** | Zero em todas as páginas | Adicionar Organization (todas), Product/SoftwareApplication (crm-gestao), FAQPage (landings com FAQ) |
| **sitemap.xml / robots.txt** | Não existem | Criar |
| **Pixel nas restantes páginas** | Só `crm-gestao.html` tem Pixel | Estender PageView (sob consent) ao site todo; `Lead` no submit dos forms de contacto |
| **og-image.jpg** | Referenciado (`https://branct.com/og-image.jpg`) mas não existe no repo | Criar OG image nova com o branding light |
| **Prova social** | 4 projetos com link, zero testemunhos, zero números | Estrutura criada no redesign; conteúdo real a fornecer pelo marketing |
| **FAQ + pricing nas landings** | Não existem | Criar (trial 7 dias sem cartão, plano Business) |
| **favicon** | `favicon.ico`/`icon.svg` referenciados — confirmar existência | Verificar/gerar |

## 6. Compliance de comunicação (lembrete para todo o copy novo)

- Dashboard anúncios/analytics com atribuição ao CRM → comunicar **sempre como Beta**
- NÃO prometer integrações Meta Ads/Google Analytics "em escala"
- NÃO prometer importação CSV de outro CRM
- PODE comunicar: IA WhatsApp 24/7 com handoff humano, pipeline visual, trial 7 dias sem cartão, multi-segmento/idioma/moeda, afiliados 30%
- O copy atual de `crm-gestao.html` ("Lead scoring com IA", "SMS", "previsão") será revisto contra esta lista na Fase 2

## 7. Arquitetura alvo (inalterada nos URLs)

`index.html` · `crm-gestao.html` · `website-premium.html` · `landing-page.html` · `automacao-ia.html` (existe e tem tráfego de menu — mantém-se, embora fora da lista do handoff) · `servicos.html` · `processo.html` · `blog.html` · `contactos.html` · `area-do-usuario.html` · `politica-privacidade.html` + novo `styleguide.html` (interno, noindex).

Stack: **HTML/CSS/JS vanilla, sem build step** — mantém o deploy FTP simples e elimina risco de regressão de pipeline. JS alvo: < 30 KB total não-gzip (i18n loader + drawer + forms + reveals + consent).

## 8. Riscos & decisões em aberto

1. **Turnstile precisa de site key** (Cloudflare) e validação server-side no n8n — bloqueado em input do Felipe.
2. **Screenshots do produto**: existe `crm-dashboard.jpeg` (com overlays de privacidade). Para o conceito product-led precisamos de 2–3 screenshots adicionais (pipeline Kanban, inbox WhatsApp IA, dashboard Beta) — pedir ao dev do CRM ou capturar de app.branct.com.
3. **Testemunhos/logos de clientes** — conteúdo a fornecer pelo marketing; o design reserva os slots.
4. `area-do-usuario.html`, `servicos.html`, `blog.html` são stubs — ganham layout real na Fase 3.
