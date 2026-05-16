# Design — Nova linguagem visual + Homepage (sub-projeto 1)

**Data:** 2026-05-12
**Estado:** aprovado (design); à espera de revisão do spec
**Sub-projeto:** 1 de N (decomposição do redesign do site branct.com)

---

## 1. Contexto e objetivo

O site `branct.com` é estático (HTML/CSS/JS vanilla, sem build, deploy FTP via GitHub Actions). Tem 11 páginas, i18n em 4 idiomas (PT/EN/IT/HR via JSON + `data-i18n`), um design "tech-luxury" escuro com cyan néon, glass-morphism, preloader e um fundo Three.js pesado.

O dono (Rafael Martins de Almeida, marca BRANCT.Tech) quer elevar o site a "nível top de linha 2026": profissional, clean, rápido, com conteúdo comercial reescrito por um redator real, em todos os idiomas.

Por ser demasiado grande para um único spec, o trabalho foi decomposto. **Este sub-projeto** entrega a **nova linguagem visual provada na homepage** (`index.html`), com copy reescrito em pt-PT e i18n da homepage nos 4 idiomas. As outras 9 páginas serão sub-projetos próprios depois.

### Decisões já tomadas (brainstorming)
- Estética: **Tech-Luxury Elevado** — mantém ADN escuro + cyan, refinado (tipografia, espaço, micro-interações premium).
- Fundo: **dark sólido, nada por cima** (máxima velocidade). Sem aurora, sem grelha, sem 3D no fundo, sem Three.js fullscreen.
- 3D: **objetos/profundidade dentro dos cards** (CSS 3D + parallax no cursor), não no fundo.
- Botões: **micro-animações** (lift/glow no hover, scale no press, seta que desliza).
- Homepage: **híbrida** — estúdio de engenharia digital + Branct CRM. CTA primário = pedir proposta; CTA secundário visível = trial CRM.
- Voz: **pt-PT neutro/empresarial** (sem "tu" nem "você"). Nota: difere da `crm-gestao.html` que usa "tu" — aceitável (landing de campanha ≠ site institucional); alinhamento deferido.
- Idiomas: **4** (pt-PT fonte → EN, IT, HR — copy localizado, não tradução literal).
- Theme toggle: **removido** — site dark-only.
- Secção de Serviços: **mantém o scroll horizontal** (assinatura, GSAP), stack vertical no mobile.
- Card "Agendar call": **abre WhatsApp** com mensagem pré-preenchida.
- Implementação dos 3D: **B1 — CSS 3D + parallax no hover** (zero JS pesado, zero assets).

---

## 2. Âmbito

### Dentro
- Novo design system em `src/css/branct.css` (tokens + componentes + estilos da homepage).
- Novo `src/js/branct.js` (i18n loader, header/nav/drawer/dropdown, GSAP reveals + scroll horizontal, parallax dos cards 3D, seletor de idioma).
- `index.html` redesenhada de raiz com a nova linguagem.
- Copy da homepage reescrito em pt-PT neutro (texto completo neste spec).
- Chaves i18n da homepage reescritas em `src/i18n/pt.json` (fonte) + adaptadas em `en.json`, `it.json`, `hr.json`.
- Remoção do preloader, do `three-scene.js` e do importmap Three.js **da homepage**.

### Fora
- As outras 9 páginas (`website-premium`, `landing-page`, `automacao-ia`, `processo`, `servicos`, `contactos`, `blog`, `area-do-usuario`, `politica-privacidade`) — cada uma será sub-projeto próprio.
- `crm-gestao.html` — **congelada** (campanha Meta Ads ativa, form/pixel acabados de validar).
- O `src/css/main.css` e o `src/js/main.js` antigos — ficam intactos a servir as páginas ainda não migradas.
- O app `app.branct.com`.
- Re-hospedar fontes localmente, blog com conteúdo, ferramenta de agendamento dedicada.

---

## 3. Arquitetura e estratégia de ficheiros

Migração página-a-página, sem risco para as páginas antigas:

| Ficheiro | Ação |
|---|---|
| `src/css/branct.css` | **Novo.** Design system + estilos da homepage. Só a `index.html` o referencia (por agora). |
| `src/css/main.css` | **Intacto.** Continua a servir as 9 páginas antigas. Quando uma página migrar, troca-se o `<link>` para `branct.css`. Apaga-se no fim de tudo. |
| `src/js/branct.js` | **Novo.** Carregado com `defer`. Módulos internos: `i18n`, `nav`, `reveal`, `horizontalScroll`, `card3d`, `langSelector`. Reaproveita a lógica i18n testada do `main.js`. |
| `src/js/main.js` | **Intacto.** Serve as páginas antigas. |
| `src/js/three-scene.js` | **Não referenciado pela homepage.** Fica no repo até as páginas que o usam migrarem (verificar quais — pelo menos `index.html` deixa de o usar). |
| `index.html` | **Reescrita.** Liga só a `branct.css` + `branct.js` + GSAP CDN (defer). Sem importmap Three.js, sem preloader. |
| `src/i18n/{pt,en,it,hr}.json` | Chaves da homepage reescritas; resto intacto. |

GSAP + ScrollTrigger + SplitType continuam via CDN (`jsdelivr`, `defer`) — usados para os reveals on-scroll e o scroll horizontal. ~70 KB combinados; aceitável. (Opção futura: substituir SplitType por um splitter custom de ~1 KB.)

---

## 4. Design tokens (`branct.css`, camada `@layer tokens`)

```
/* Cor — superfícies */
--bg:            #070b11;   /* navy quase-preto, base */
--bg-elev:       #0d141d;   /* superfície elevada (cards) */
--bg-elev-2:     #111c27;   /* hover de card */
--line:          rgba(255,255,255,0.07);
--line-strong:   rgba(110,193,228,0.22);

/* Cor — acento */
--accent:        #6ec1e4;   /* cyan principal */
--accent-bright: #8fd4f0;   /* cyan claro (hover/glow) */
--accent-deep:   #0e7fa3;   /* cyan profundo (gradientes) */
--accent-glow:   rgba(110,193,228,0.35);

/* Cor — texto */
--text:          #f2f5f8;
--text-muted:    #9aa6b4;
--text-dim:      #6b7886;

/* Tipografia */
--font-display:  'Space Grotesk', system-ui, sans-serif;
--font-body:     'Inter', system-ui, sans-serif;
--font-mono:     'JetBrains Mono', ui-monospace, monospace;
/* escala fluida */
--fs-display:    clamp(2.5rem, 1.6rem + 4.2vw, 5rem);
--fs-h1:         clamp(2rem, 1.5rem + 2.4vw, 3.2rem);
--fs-h2:         clamp(1.6rem, 1.3rem + 1.6vw, 2.4rem);
--fs-h3:         1.15rem;
--fs-body:       1rem;
--fs-small:      0.9rem;
--fs-label:      0.74rem;   /* micro-label mono maiúsculo */

/* Espaço — escala 4px */
--sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
--sp-6: 24px; --sp-8: 32px; --sp-12: 48px; --sp-16: 64px;
--sp-24: 96px; --sp-32: 128px;
--section-y: clamp(80px, 6vw + 40px, 160px);

/* Raios */
--r-sm: 8px; --r-md: 14px; --r-lg: 20px; --r-xl: 28px; --r-full: 999px;

/* Sombras */
--sh-1: 0 1px 2px rgba(0,0,0,0.4);
--sh-2: 0 8px 30px rgba(0,0,0,0.45);
--sh-3: 0 24px 60px rgba(0,0,0,0.55);
--sh-cta: 0 12px 40px var(--accent-glow), 0 4px 16px rgba(0,0,0,0.4);

/* Motion */
--ease: cubic-bezier(0.2, 0.8, 0.2, 1);
--dur-fast: 150ms; --dur: 250ms; --dur-slow: 400ms;

/* Layout */
--container: 1200px;
--prose: 720px;
```

`@layer` order: `reset, tokens, base, layout, components, sections, utilities`. Todo o motion dentro de `@media (prefers-reduced-motion: no-preference)` ou neutralizado num bloco `reduce`.

---

## 5. Componentes

### Botão (`.btn`, `.btn--primary`, `.btn--ghost`, `.btn--sm`)
- Primário: fundo `--accent`, texto `--bg`, `box-shadow: --sh-cta`. Hover: `translateY(-2px)` + glow mais forte + um sweep de brilho (pseudo-elemento que atravessa). Press: `scale(0.98)`. Ícone-seta: `transform: translateX(3px)` no hover.
- Ghost: transparente, borda `1px var(--line)`, texto `--text`. Hover: borda → `--accent`, texto → `--accent`, fundo `rgba(110,193,228,0.06)`.
- `prefers-reduced-motion`: sem lift, sem sweep, mantém só mudança de cor.

### Card 3D (`.tilt-card`, com `.tilt-card__layer`)
A interação de assinatura. O padrão já existe no `processo` atual (`card-3d-layer`); generaliza-se.
- Container: `transform-style: preserve-3d; perspective: 900px;`. JS aplica `rotateX/rotateY` (máx ±6°) conforme a posição do cursor relativa ao card, com lerp para suavidade; reset no `mouseleave`.
- Camadas internas com `translateZ(20–40px)` para o ícone e o conteúdo "flutuarem".
- Realce radial (`::before`) que segue o cursor (`--mx`, `--my` via JS).
- Borda-gradiente `1px` (`::after` com `mask` ou `border-image`) que acende no hover.
- **Desativado** em `(pointer: coarse)` e `prefers-reduced-motion` — fica um card estático com hover-lift simples.

### Eyebrow (`.eyebrow`)
Micro-label mono maiúsculo, cor `--accent`, com um ponto a pulsar (`::before`, `animation: pulse 2.4s`). Usado no topo de cada secção e do hero.

### Nav (`.header`, `.nav`, `.nav__dropdown`, `.drawer`)
- Header `position: sticky; top: 0`. No topo: fundo transparente. Após `scrollY > 8px` (toggle de classe via JS): `backdrop-filter: blur(14px)`, fundo `rgba(7,11,17,.8)`, borda inferior `--line`.
- Dropdown "Serviços" (desktop): hover/focus, `aria-haspopup`, `aria-expanded`.
- Drawer mobile: botão hambúrguer → painel lateral, `aria-modal`, trap de foco, fecha com Esc/click-fora/click-link.

### Heading block (`.section-head`)
`eyebrow + h2 + (opcional) .section-head__sub`. Centrado nas secções de showcase, à esquerda nas de texto.

### Outros
- Chip de prova (`.proof-chip`): ícone + texto curto, fundo `rgba(110,193,228,.06)`, borda `--line-strong`, `--r-full`.
- Tech chip (`.tech-chip`): mono pequeno, usado nos visuais dos serviços.
- Project item (`.project-item`): linha clicável (número · título · categoria · seta), com preview de imagem que segue o cursor (`.project-preview`, `position: fixed`, atualizado por JS, `aria-hidden`).
- Access card (`.access-card`): ícone + título + linha de apoio, link inteiro clicável, hover-lift.

---

## 6. Estrutura da homepage e copy (pt-PT — fonte de verdade)

Ordem das secções no `<main>`: Hero → Serviços (horizontal) → Processo → Casos → Faixa Branct CRM → Contacto. Header e Footer fora do `<main>`.

### 6.0 Header
- Logo: `BRANCT.Tech` (`.Tech` em cyan, peso menor).
- Nav: **Início · Serviços ▾ · Processo · Casos · Contactos**. (Blog **sai** do header — fica vazio; pode voltar quando tiver conteúdo. Acessível, se quiseres, só pelo footer.)
  - Submenu Serviços: Website Premium · Landing Pages · Branct CRM · Automação & IA.
- Direita: seletor de idioma (PT/EN/IT/HR) · "Área de Cliente" (link texto → `https://app.branct.com/`) · **"Pedir proposta"** (botão primário → `contactos.html`).
- Drawer mobile espelha tudo + CTA "Pedir proposta" em baixo.

### 6.1 Hero
- Eyebrow: **"Estúdio de engenharia digital"**
- Headline (display): **"Engenharia digital que acelera negócios."**
  - Alternativas guardadas: "Construímos o motor digital de marcas que querem crescer." / "Sites, CRM e automação — com método de engenharia."
- Sub: **"Websites premium, uma plataforma de CRM própria e automação com IA — tudo medido por performance, SEO técnico e conversão."**
- CTAs: **"Pedir proposta"** (primário → `contactos.html`) · **"Conhecer o Branct CRM"** (ghost → `crm-gestao.html`)
- Linha de 4 chips de prova: **"Core Web Vitals 95+"** · **"SEO técnico nativo"** · **"Automação com IA"** · **"4 idiomas"**
- Visual: hero type-led + **um card "preview de dashboard"** (`.tilt-card`) ao lado/abaixo, usando `src/img/crm-dashboard.jpeg` (já existe, já tem os blurs de privacidade) ou `src/img/notebook.png`. No mobile o card colapsa por baixo do texto ou esconde-se.
- Indicador de scroll subtil em baixo.

### 6.2 Serviços (scroll horizontal — GSAP ScrollTrigger; stack vertical no mobile)
Section head: eyebrow **"O que fazemos"** · h2 **"Quatro frentes, um método."**
4 slides:

**Slide 1 — Websites Premium** · badge `PERFORMANCE`
> "Sites rápidos, sóbrios e construídos para converter — com base técnica sólida em SEO, performance e escalabilidade."
> • Design orientado a leads • Core Web Vitals otimizados • SEO técnico (estrutura + schema) • Arquitetura modular
> CTA: "Ver detalhes" → `website-premium.html` · tech-chips: CWV 95+ · PWA · SSR

**Slide 2 — Landing Pages** · badge `CONVERSÃO`
> "Páginas de campanha desenhadas a partir do objetivo: uma mensagem, um caminho, uma ação. Prontas para tráfego pago."
> • Arquitetura de conversão • Integração com Meta e Google Ads • Captura de UTMs e eventos • Estrutura A/B-testável
> CTA: "Ver detalhes" → `landing-page.html` · tech-chips: Meta Pixel · UTM tracking · A/B

**Slide 3 — Branct CRM** · badge `PRODUTO`
> "A nossa plataforma de CRM: pipeline visual, follow-up automático e dashboards em tempo real. Trial de 7 dias sem cartão."
> • Pipeline com regras e etapas • Automação de follow-ups • WhatsApp, email e omni-canal • Dashboards de receita
> CTA: "Trial de 7 dias" → `crm-gestao.html` · tech-chips: n8n · OpenAI · API REST

**Slide 4 — Automação & IA** · badge `AUTOMAÇÃO`
> "Atendimento e nutrição de leads no piloto automático, sem perder o toque humano — fluxos, segmentação e IA que responde."
> • WhatsApp API e chat operacional • Sequências de email • Automação por eventos e etapas • Qualificação de leads com IA
> CTA: "Ver detalhes" → `automacao-ia.html` · tech-chips: WhatsApp API · SMTP · Webhooks

Indicador de progresso (01/04 + barra de 4 segmentos), igual ao atual mas refinado.

### 6.3 Processo (4 cards 3D-tilt)
Section head: eyebrow **"Como trabalhamos"** · h2 **"Método de engenharia, do briefing ao crescimento."**
1. **Diagnóstico** — "Alinhamos objetivos, público e prioridades. A arquitetura vem antes do design." — chips: Análise · Arquitetura
2. **Design** — "UI/UX e protótipo validável. Clareza, credibilidade e foco em conversão." — chips: UI/UX · Protótipo
3. **Construção** — "Implementação com performance, SEO técnico e integrações para tracking e automação." — chips: Clean code · SEO nativo
4. **Escala** — "Monitorização e otimização contínua. Evolução orientada por dados." — chips: Analytics · Growth

### 6.4 Casos / Trabalho
Section head: eyebrow **"Trabalho recente"** · h2 **"Marcas que já confiaram."** · sub: "Sites e plataformas entregues em Portugal e no Brasil."
Lista de 4 (preview-no-hover que segue o cursor):
1. **Neoprag** — Web institucional · BR → `https://www.neoprag.com.br`
2. **VertexWay** — Website e marca · PT → `https://www.vertexway.pt`
3. **Albino Santos** — Imobiliário · landing page · PT → `https://albinosantos.pt/t4-rua-damiao-de-gois-porto/`
4. **KB Assessoria** — Contabilidade · website · BR → `https://www.kbassessoriacontabil.com.br`

### 6.5 Faixa Branct CRM (NOVA)
Strip de produto (fundo ligeiramente distinto, ex. gradiente subtil `--bg → --bg-elev`):
- Eyebrow: **"Produto próprio"**
- Headline: **"Um CRM que organiza a operação comercial — do primeiro lead à receita."**
- Body: "Pipeline visual, follow-up automático e IA que responde leads em segundos. Tudo numa plataforma própria, sem juntar cinco ferramentas."
- 3 pontos: "Trial de 7 dias, sem cartão" · "Setup em 60 segundos" · "Em português, pensado para PME"
- CTA: **"Começar trial gratuito"** → `crm-gestao.html`

### 6.6 Contacto / CTA final
Card glass refinado, 2 colunas.
- Esquerda: h2 **"Vamos mapear o próximo passo?"** · sub **"Envia o objetivo e o prazo. Devolvemos um plano claro e os próximos passos."** · contactos: `contacto@branct.com` · `936 465 696` (tel:+351936465696) · `Guimarães, Portugal` · socials: LinkedIn, Instagram, Facebook (URLs já existentes no HTML atual).
- Direita: 3 access-cards:
  1. **"Chat direto"** / "Resposta rápida pelo WhatsApp." → `https://wa.me/351936465696`
  2. **"Agendar call"** / "20–30 min para mapear o projeto." → `https://wa.me/351936465696?text=Ol%C3%A1!%20Quero%20agendar%20uma%20call%20para%20falar%20de%20um%20projeto.`
  3. **"Briefing detalhado"** / "Envia requisitos e contexto." → `mailto:contacto@branct.com`

### 6.7 Footer
- Brand: `BRANCT.Tech` · "© 2026 BRANCT.Tech. Todos os direitos reservados."
- (Opcional) colunas: **Serviços** (4 links) · **Empresa** (Processo, Casos, Contactos) · **Legal** (Privacidade, Termos).
- Links legais: Privacidade → `politica-privacidade.html#privacidade` · Termos → `politica-privacidade.html#termos` (corrige os `href="#"` partidos do footer atual).
- Socials: LinkedIn, Instagram, Facebook.

---

## 7. i18n

- Sistema mantém-se: `src/i18n/{pt,en,it,hr}.json` (objetos aninhados, dot-notation) + atributos `data-i18n` / `data-i18n-title` + carregamento por fetch + cache em `localStorage` (`branct_lang`) + `AbortController`. A lógica do `main.js` é reaproveitada no `branct.js`.
- Reescrevo as chaves da homepage em `pt.json` (fonte). Estrutura de chaves: `nav.*`, `hero.*`, `services.items.{web,landing,crm,auto}.*`, `process.step{1..4}.*`, `projects.items.*`, `crmBand.*`, `contact.*`, `footer.*`, `lang.*`, `a11y.*`.
- EN/IT/HR: **copy localizado e adaptado** (não tradução literal — headlines comerciais nativos em cada língua), produzido na fase de implementação a partir do pt-PT.
- Chaves das outras páginas nos JSON ficam **intactas**.
- Texto hardcoded no HTML mantém-se mínimo; tudo o que é visível ao utilizador tem `data-i18n`.

---

## 8. Micro-interações e motion

| Onde | Interação |
|---|---|
| Botões | hover: lift 2px + glow + sweep de brilho; press: `scale(.98)`; seta desliza 3px |
| Cards `.tilt-card` | `rotateX/Y` ±6° pelo cursor (lerp), camadas com `translateZ`, realce radial que segue o rato, borda que acende |
| Header | transparente → blur escuro ao passar `scrollY > 8` |
| Reveals | secções/elementos com `IntersectionObserver` → fade+`translateY(18px→0)`; GSAP para sequências (hero, headings) |
| Serviços | scroll horizontal pinado (GSAP ScrollTrigger) no desktop; no mobile vira stack vertical normal |
| Casos | imagem de preview segue o cursor; fade in/out suave |
| Project arrows / links | translate subtil no hover |
| Eyebrow dot | pulse 2.4s infinito |

Tudo dentro de `prefers-reduced-motion: no-preference`. Em `reduce`: sem tilt, sem parallax, sem scroll horizontal pinado (serviços ficam stack vertical), sem reveals (tudo visível), sem pulse, `scroll-behavior: auto`.

---

## 9. Orçamento de performance e acessibilidade

### Performance
- **Removido da homepage**: Three.js (~150 KB+), `three-scene.js`, modelos GLB, preloader.
- **Mantido**: GSAP + ScrollTrigger + SplitType (CDN jsdelivr, `defer`, ~70 KB combinados).
- Imagens: `loading="lazy"` em tudo abaixo da fold; `fetchpriority="high"` + `loading="eager"` só no visual do hero; `width`/`height` explícitos para zero CLS; servir WebP onde possível.
- Fontes: `preconnect` para Google Fonts; `display=swap`. (Re-hospedar localmente fica como follow-up.)
- CSS/JS: um ficheiro CSS, um JS — minificação fica como follow-up (não bloqueia).
- **Alvos**: Lighthouse mobile — Performance ≥ 95, Acessibilidade ≥ 95, Best Practices ≥ 95, SEO ≥ 100. LCP < 1.8 s. CLS < 0.05. TBT < 150 ms.

### Acessibilidade
- HTML semântico: `header`, `nav`, `main`, `section` com `aria-label`, `footer`.
- Skip link visível no Tab.
- Navegação 100% por teclado; focus states visíveis (anel cyan).
- Dropdown e drawer com `aria-haspopup`/`aria-expanded`/`aria-modal`, trap de foco no drawer, fecha com Esc.
- `prefers-reduced-motion` neutraliza todo o motion descrito acima.
- Contraste de texto ≥ 4.5:1 (verificar o muted `#9aa6b4` sobre `#070b11` → ~7:1, OK).
- Imagens com `alt` descritivo; ícones decorativos com `aria-hidden`.
- Live region para anúncio da secção ativa no scroll horizontal (já existe `#scroll-live-region`).

---

## 10. Plano de QA

Manual, antes de considerar feito:
- Lighthouse mobile + desktop — confirmar alvos da §9.
- axe DevTools — zero violações críticas.
- Passagem só-teclado: Tab por toda a página, drawer, dropdown, todos os CTAs alcançáveis e operáveis.
- Mobile: iPhone 12 + Galaxy S20 no DevTools — sem overflow horizontal, CTAs grandes, scroll de serviços vira stack.
- Os 4 idiomas renderizam sem chaves em falta nem layout partido; trocar idioma persiste no reload.
- Modo `prefers-reduced-motion`: sem tilt/parallax/scroll-pin/reveals.
- Zero erros de consola.
- Links: todos os internos e externos resolvem; legais apontam para `politica-privacidade.html#…`.
- Comparação visual antes/depois (screenshots manuais).

---

## 11. Itens em aberto / a confirmar durante a implementação
- Headline final do hero (3 candidatas em §6.1) — escolher com o utilizador ao rever o resultado.
- Mensagem exata pré-preenchida do WhatsApp "Agendar call" (proposta em §6.6).
- Blog fora do header — confirmar (default: fora; pode estar no footer).
- Footer com colunas vs. footer minimal de uma linha — default: colunas (§6.7).
- Imagem do card-hero: **decidido `crm-dashboard.jpeg`** (escuro, com blurs de privacidade, alinhado ao dark tech-luxury; `notebook.png` é claro/naturalista — não encaixa, ver `MOCKUP-IMPLEMENTATION.md`).

## 12. Fora de âmbito (follow-ups / sub-projetos futuros)
- Migrar as 9 páginas restantes para `branct.css` (cada uma o seu spec).
- Alinhar a voz da `crm-gestao.html` (tu) com o resto (neutro).
- Conteúdo real para o blog.
- Ferramenta de agendamento dedicada (Cal.com/Calendly).
- Minificação de CSS/JS no pipeline de deploy.
- Re-hospedar fontes localmente.
- Limpar `three-scene.js` e o `main.js` antigo quando todas as páginas estiverem migradas.
