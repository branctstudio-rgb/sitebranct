# Branct.Tech — Guia para o Claude

Contexto e histórico do projeto. Este ficheiro é lido automaticamente em cada sessão do Claude Code dentro de `sitebranct/`. Manter conciso e atualizado.

---

## O que é

Site institucional da **BRANCT.Tech** — agência digital em Guimarães (PT). HTML estático servido como ficheiros, sem build step. Captura de leads via Supabase (Edge Functions + Postgres). Produto CRM separado vive em `app.branct.com` (outro repositório, outro dev).

Idioma do site: **pt-PT** (com i18n PT/EN/IT/HR via `data-i18n` keys e ficheiros em [src/i18n/](src/i18n/)).

---

## Tech stack

- HTML estático + CSS único ([src/css/main.css](src/css/main.css)) + JS modular ([src/js/](src/js/))
- GSAP + ScrollTrigger + SplitType (animações)
- Three.js (cena WebGL no hero do `index.html`)
- Supabase: Edge Functions (Deno) + Postgres (RLS ativa)
- Meta Pixel (id `1595310191130205`) — **sempre gated por consent banner RGPD**
- `package.json` declara `express` e `three`, mas o site é servido estaticamente. O `express` parece não estar em uso ativo.

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

### Paleta (consistente em ambos os contextos)
- `--bg: #09121c`, `--bg-2: #072c3d`
- `--accent: #6ec1e4` (ciano principal), `--accent-2: #097697`
- Tipografia: **Bricolage Grotesque** (display, H1-H3) + **Manrope** (texto)
- No `index.html` adiciona-se também Inter, Space Grotesk e JetBrains Mono

### Meta Pixel
- Carregado em `crm-gestao.html` mas `fbq('init')` + `fbq('track', 'PageView')` **só após** o utilizador clicar "Aceitar" no banner de consent
- Eventos disparados via `window.brancrPixel.track(name, params)` — definido no IIFE inline da página, respeita o gate
- Eventos atuais: `PageView`, `ViewContent`, `Lead`, `StartTrial`

### i18n
- Atributo `data-i18n="path.to.key"` no HTML; o JS substitui pelo idioma ativo
- `lang-selector` no header tem PT/EN/IT/HR
- Algumas páginas (servicos.html, blog.html) têm caracteres mojibake nos textos PT — convém limpar quando tocares

---

## Fluxo do trial (estado atual — 2026-05-13)

```
landing /crm-gestao.html
    │  form submit (nome, email, empresa)
    │  trial.js valida + dispara Lead+StartTrial (Pixel, sob consent gate)
    ▼
window.location.href = https://app.branct.com/signup
    ?trial=true&name=&email=&company=&utm_*
    │
    ▼
CRM (app.branct.com — outro repo, outro dev)
    pré-preenche os 3 campos, pede só password,
    cria conta Supabase Auth, autentica, leva ao dashboard
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
