# Branct.Tech — Guia para o Claude

Contexto e histórico do projeto. Este ficheiro é lido automaticamente em cada sessão do Claude Code dentro de `sitebranct/`. Manter conciso e atualizado.

---

## O que é

Site institucional da **BRANCT.Tech** — agência digital em Guimarães (PT). HTML estático servido como ficheiros, sem build step. Captura de leads via Supabase (Edge Functions + Postgres). Produto CRM separado vive em `app.branct.com` (outro repositório, outro dev).

Idioma do site: **pt-PT** (com i18n PT/EN/IT/HR via `data-i18n` keys e ficheiros em [src/i18n/](src/i18n/)).

---

## Tech stack

- HTML estático, sem build step. **Em migração para o design system "Premium Light 2026"** (branch `redesign-light-2026`, ver [AUDIT.md](AUDIT.md)):
  - Páginas migradas usam [src/css/branct.css](src/css/branct.css) + [src/js/branct.js](src/js/branct.js) — light, zero GSAP/Three.js. Migradas até agora: `index.html`, `crm-gestao.html` (standalone), `styleguide.html`.
  - Páginas antigas continuam em [src/css/main.css](src/css/main.css) + [src/js/main.js](src/js/main.js) (dark, GSAP, Three.js) até migrarem na Fase 3.
- Supabase: Edge Functions (Deno) + Postgres (RLS ativa) — atualmente órfãs (ver Pontos abertos)
- Leads dos forms da agência → webhook n8n `https://n8n.branct.com/webhook/site-lead`
- Meta Pixel (id `1595310191130205`) — **sempre gated por consent banner RGPD**
- `package.json` declara `express` e `three`, mas o site é servido estaticamente; saem quando a migração terminar.

---

## Estrutura

```
sitebranct/
├── index.html                  # Home — hero 3D + scroll horizontal de serviços
├── crm-gestao.html             # Landing standalone do trial do CRM (CSS inline próprio)
├── website-premium.html        # Página de serviço
├── landing-page.html           # Página de serviço
├── automacao-ia.html           # Página de serviço
├── processo.html               # Como trabalhamos
├── contactos.html              # Formulário de contacto
├── politica-privacidade.html   # RGPD
├── area-do-usuario.html        # Stub (atualmente redireciona o utilizador para app.branct.com)
├── blog.html, servicos.html    # Stubs
├── src/
│   ├── css/main.css            # Single source of truth para tudo EXCETO crm-gestao.html
│   ├── js/
│   │   ├── main.js             # Boot do site (header, mobile drawer, scroll-trigger, i18n, theme)
│   │   ├── three-scene.js      # WebGL hero
│   │   └── trial.js            # Handler do form de trial em crm-gestao.html
│   ├── i18n/                   # Traduções
│   ├── img/                    # Imagens (crm-dashboard.jpeg, projetos, etc.)
│   ├── 3d/, models/            # Assets Three.js
└── supabase/
    ├── functions/trial-signup/ # Edge Function (ATUALMENTE ÓRFÃ — ver Changelog)
    └── migrations/             # SQL da tabela trial_signups
```

---

## Convenções

### `crm-gestao.html` é especial
- **Standalone**: não usa o `src/css/main.css` partilhado. Tem CSS inline próprio com a sua própria paleta.
- Razão: é uma landing de aquisição com performance e tracking dedicados, separada do site institucional. Mantém-se assim.

### Paleta — design system "Premium Light 2026" (páginas migradas)
- Base clara: `--bg: #FAFAF9`, cards `#FFFFFF`, hairlines `#E8E6E1`, ink `#0D1B24`
- Acento interativo: teal `#0C7C8F` (hover `#095E6E`); `#00F6EC` vivo é SÓ decorativo; roxo `#8B5CF6`/`#6D28D9` exclusivo de contexto de produto (badges Beta)
- **CTAs com significado de funil**: botão ink = agência (proposta); botão teal = trial do CRM
- Tipografia: **Bricolage Grotesque** (display, variável) + **Manrope** (texto)
- Páginas antigas (main.css) mantêm a paleta dark `#09121c`/`#6ec1e4` até migrarem

### Meta Pixel — divisão de funil (regra de ouro)
- Carregado em `crm-gestao.html` mas `fbq('init')` + `fbq('track', 'PageView')` **só após** o utilizador clicar "Aceitar" no banner de consent
- Eventos disparados via `window.brancrPixel.track(name, params, options)` — definido no IIFE inline da página, respeita o gate. `options = { eventID }` para dedup CAPI futura
- **Landing (topo de funil):** só `ViewContent` (form ≥50% visível, 1x) e `Lead` (1x, no submit, com `eventID` UUID guardado em `sessionStorage['branct_lead_eventid']`)
- **A landing NUNCA dispara `StartTrial`.** Conversão real é exclusiva de `app.branct.com/signup`, que dispara `PageView` + `StartTrial` no momento da criação da conta no Supabase (outro repo/dev)
- Campanha deve **otimizar por `StartTrial`** (conta real). `Lead` é só métrica de intenção/diagnóstico — não otimizar por Lead
- Pixel ID: `1595310191130205` (mesmo nos dois lados, para o Meta cruzar funil)

### i18n
- Atributo `data-i18n="path.to.key"` no HTML; o JS substitui pelo idioma ativo
- `lang-selector` no header tem PT/EN/IT/HR
- Algumas páginas (servicos.html, blog.html) têm caracteres mojibake nos textos PT — convém limpar quando tocares

---

## Fluxo do trial (estado atual — 2026-05-13)

```
Anúncio → landing /crm-gestao.html
    │  ViewContent (form ≥50% visível, 1x)
    │  form submit (nome, email, empresa) → trial.js valida
    │  Lead (1x, no submit, com eventID UUID) — sob consent gate
    ▼
window.location.href = https://app.branct.com/signup
    ?trial=true&name=&email=&company=&utm_*&ref(se existir)
    │
    ▼
CRM (app.branct.com — outro repo, outro dev)
    PageView (chega ao /signup)
    pré-preenche os 3 campos, pede só password,
    cria conta Supabase Auth → StartTrial (conversão real, 1x) → dashboard
```

Decisão arquitetural: **a password nunca passa pela landing**. A landing é estática — se for comprometida amanhã, não vaza credenciais. A criação real da conta + Auth vive toda no CRM.

### Pontos abertos
- **Edge Function órfã**: [supabase/functions/trial-signup/index.ts](supabase/functions/trial-signup/index.ts) e [migration `20260512000000_create_trial_signups.sql`](supabase/migrations/20260512000000_create_trial_signups.sql) deixaram de ser chamadas após a refatoração de 2026-05-13. Mantidas no repo por segurança — apagar quando o novo fluxo estiver validado em produção.
- **CRM tem de aceitar** `?trial=true&name=&email=&company=` no `/signup`. Trabalho do outro dev em `app.branct.com`.

---

## Comandos úteis

Site estático — não há build/dev server configurado no `package.json`. Para desenvolvimento local podes usar qualquer servidor estático (ex.: `npx serve sitebranct/` ou Live Server no VS Code).

Deploy da Edge Function (referência, atualmente desativada):
```
supabase functions deploy trial-signup --project-ref ksocmuesmlqzpbtmibgu --no-verify-jwt
```

---

## Changelog

Entradas em ordem cronológica inversa (mais recente em cima). Data em ISO. Cada entrada: o que mudou, porquê, ficheiros tocados.

### 2026-06-11 — Redesign "Premium Light 2026": Fases 0–2 (branch `redesign-light-2026`)
**Porquê:** handoff do marketing (ver `MARKETING/_shared/handoffs/PROMPT_CLAUDE_CODE_SITE_PREMIUM_2026.md`): site light premium, performance budget Lighthouse ≥95 mobile, product-led, killer features do CRM em destaque. Supersede o spec dark de 2026-05-12.

- **Fase 0** — [AUDIT.md](AUDIT.md): inventário completo; 42MB de peso morto identificado (Three.js + .glb + video.mp4); gaps: Turnstile inexistente, schema.org zero, sitemap/robots em falta.
- **Fase 1** — [src/css/branct.css](src/css/branct.css) (design system light) + `styleguide.html` (demo interna, noindex).
- **Fase 2** — `index.html` reescrita (hero split agência+CRM, prova social, bento de serviços, faixa CRM, processo, casos, CTA final, consent banner + Pixel PageView gated, schema.org Organization, i18n `home.*` nos 4 idiomas) e `crm-gestao.html` reescrita light (hero 1 CTA → stats → 3 killer features bento (IA WhatsApp 24/7, dashboard ads **Beta**, multi-segmento) → 3 passos → pricing trial → FAQ → CTA → form). **Tracking intocado**: IIFE consent/Pixel, trial.js (só label do botão), IDs do form, hidden UTMs, redirects. Copy revista contra a lista de compliance (sem lead scoring IA, sem SMS, sem promessas de integrações em escala).
- [src/js/branct.js](src/js/branct.js): consent+Pixel site-wide, i18n, drawer, dropdown, reveals IO, forms→webhook n8n com `Lead`+eventID.
- deploy.yml: exclusões novas (docs/, supabase/, .claude/, AUDIT.md, CLAUDE.md, src/models/, src/3d/, video.mp4).
- **3D + vídeo (pedido do Felipe pós-Fase 2):** tilt 3D nos cards (CSS vars `--rx/--ry/--mx/--my` escritas no pointermove, suavização por transição CSS — sem rAF, ver `.tilt` em branct.css), botões sólidos com aresta 3D + brilho varrido, frames `.frame--persp` em perspetiva. Tudo desligado em táctil/reduced-motion. Vídeo `src/img/video.mp4` (17MB HEVC, gitignored como fonte) convertido com ffmpeg para `crm-demo.webm` (613KB) + `crm-demo.mp4` (830KB H.264) + poster, barra do browser recortada; embebido lazy (`data-lazy-video`, hidrata por IntersectionObserver, play/pause por visibilidade) no hero da home, no bento da landing e no styleguide. Referências CSS/JS com `?v=` para cache-busting.
- **Scroll FX + preview de trabalhos (pedido do Felipe):** scroll-driven animations CSS (`animation-timeline: view()/scroll()`, gated por `@supports` + reduced-motion; browsers sem suporte caem nos reveals IO) — barra de progresso no topo, `.fx-rise`/`.fx-zoom` em headings, stats, frames e casos. Keyframes usam translate/scale/opacity (nunca `transform`, que pertence ao tilt). Preview dos trabalhos: `[data-img]` + `.case-preview` (branct.js `setupCasePreview`) — janela fixa segue o cursor com a capa do site (thumbs `case-*.webp` 8–20KB gerados por ffmpeg), só em rato fino. Número de contacto do site: **+351 935 183 488** (linha com IA de atendimento).
- **Validação do Felipe pendente antes da Fase 3** (restantes páginas). Não fazer push para `main` sem essa validação — push a `main` = deploy imediato para produção via FTP.

### 2026-05-16 — Funil de Pixel: landing só intenção, conversão é da app
**Porquê:** spec final do dev do CRM. O `app.branct.com/signup` passou a ter Pixel próprio que dispara `PageView` e `StartTrial` no momento real da criação da conta no Supabase (server-truth, à prova de inflação). A landing duplicava o sinal: disparava `StartTrial` (errado — não há conta ainda) e podia disparar `Lead` em cliques de CTA além do submit. Regra de ouro: **landing nunca dispara StartTrial; só 1 Lead por utilizador, no submit**. Campanha otimiza por StartTrial.

**[src/js/trial.js](src/js/trial.js):**
- Removido o disparo de `StartTrial` (agora exclusivo da app)
- `Lead` agora leva `eventID` (UUID v4, `crypto.randomUUID()` + fallback) guardado em `sessionStorage['branct_lead_eventid']` para dedup CAPI futura
- `track()` e `pixelTrack()` aceitam 3º arg `options` ({ eventID }) → `fbq('track', name, params, options)`
- Adicionada captura de `?ref=` (afiliados) → sessionStorage → encaminhado na query do redirect, a par dos `utm_*`
- `getRef()` chamado no `init` (persiste cedo) e no submit; debug log inclui ref

**[crm-gestao.html](crm-gestao.html):**
- Removido o listener `[data-event="lead"]` que disparava `Lead` em clique de CTA (era dead code mas elimina o mecanismo de inflação por design)
- `pixelTrack` estendido para aceitar `options` (eventID)
- Comentários do `<script>` e do include do trial.js atualizados

**Não tocado:** `ViewContent` (já era 1x via `io.disconnect()`), consent gate, redirect, fluxo de password/conta (app).

### 2026-05-13 — Trial signup passa a redirecionar diretamente para o CRM
**Porquê:** decisão arquitetural conjunta com o dev do CRM. A landing estática não deve manipular passwords nem criar contas; o CRM já tem todo o fluxo (Supabase Auth, criação de empresa, criação do owner). Manter "60 segundos" prometidos: landing pede 3 campos, CRM pede 1 (password).

**O que mudou em [src/js/trial.js](src/js/trial.js):**
- Removido `fetch` para a Edge Function `trial-signup`
- Removidos `FUNCTION_URL` e `SUPABASE_PUBLISHABLE_KEY`
- Adicionado `SIGNUP_URL = 'https://app.branct.com/signup'`
- `handleSubmit` valida → dispara `Lead` + `StartTrial` (Pixel) → redireciona com `?trial=true&name=&email=&company=` + UTMs
- Empresa vazia → fallback para o nome do dono
- Botão durante o redirect: "A redirecionar-te..." (era "A criar a tua conta...")

**Não tocado:**
- HTML do form em `crm-gestao.html` (os `name=` PT são internos)
- Captura de UTMs (sessionStorage → hidden inputs)
- Smooth-scroll e autofocus no form
- `ViewContent` quando o form fica ≥50% visível
- Consent gate do Meta Pixel
- Edge Function `trial-signup` e migration da tabela `trial_signups` (mantidos como órfãos)
