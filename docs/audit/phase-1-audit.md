# BRANCT Site — Fase 1: auditoria e preparação offline

Data: 2026-08-18
Issue-lock: #1
Repositório: `branctstudio-rgb/sitebranct`
Base imutável: `da8800cd7669f66a82cbf9cd2e4f22fa99d59320`
Branch de auditoria: `agent/phase-1-offline-audit`
Branch paralela intocada: `redesign-light-2026@310a4de3ff15a4abc57ea31f668c2deee48443bb`

## Resumo executivo

O repositório é a fonte canónica do site público e serve HTML/CSS/JS estático. A `main` não é protegida e o workflow existente publica por FTP após push para `main`; por isso esta auditoria usa branch e worktree isoladas e não altera `.github/workflows/deploy.yml`.

A migração Premium Light 2026 já alcançou todas as 12 páginas HTML observadas, contrariando documentação histórica que ainda descreve várias páginas como dark/stubs. A base visual está coerente e semanticamente mais madura do que o registo antigo, mas a arquitetura continua duplicada, sem suite de testes, com dependências e assets históricos no Git, sem hreflang e com uma regressão responsiva transversal no header.

Não foram submetidos formulários, ativadas integrações ou usados dados reais. Supabase, n8n, CRM, Meta, pagamentos, Chat IA, widget e produção permaneceram fora do exercício.

## WorkPlan executado

- Scope: auditoria, evidências, contratos/testes offline, arquitetura-alvo e roadmap.
- Risk: alto operacional pela `main` desprotegida; médio técnico; zero mutação intencional em produção.
- Environment: worktree local e GitHub, com site servido em `127.0.0.1`.
- Specialists: orquestração, design, frontend, motion, responsive, SEO, visual QA e performance estática.
- Acceptance gates: base exata, cinco viewports mínimos, 12 rotas, zero alteração de páginas vivas/deploy, RED→GREEN, revisão adversarial e PR draft.
- Handoff: Codex coordenador e aprovação humana; nenhum merge.

## Estado observado

### Arquitetura e código

- 12 páginas HTML, 2 folhas CSS ativas e 4 ficheiros JS.
- HTML estático sem build de desenvolvimento; minificação ocorre apenas no workflow de deploy.
- `package.json` não representa o runtime real: declara Express e Three, mas não oferece servidor/build e `npm test` é um placeholder que falha.
- `node_modules/` está versionado no repositório.
- `src/` soma aproximadamente 28,7 MB; 23,1 MB são quatro ficheiros GLB históricos.
- O design system light está em `src/css/branct.css`, mas existe CSS inline relevante e caminhos históricos em `main.css`, aumentando divergência e custo de manutenção.
- O JavaScript partilhado concentra navegação, i18n, consentimento, formulários, motion e vídeo no mesmo módulo.

### Identidade visual e conteúdo

- Direção atual: Premium Light 2026, Bricolage Grotesque + Manrope, ink/teal e roxo reservado a produto.
- A homepage equilibra agência e CRM; páginas de serviço usam cor e narrativa próprias.
- O CRM tem protagonismo e atmosfera de produto distinta.
- Blog é uma página de “em breve”; área de cliente é apenas porta para a aplicação. Devem permanecer claramente demonstrativos enquanto não houver autorização de produto.
- O site ainda não apresenta A BRANCT como futura Diretora-Geral digital, nem diferencia claramente Chat IA (interface) de A BRANCT (cérebro/coordenação).
- A documentação do BRANCT OS confirma que Core, Business e interfaces são linhas futuras sujeitas a isolamento por tenant e gates humanos; o site não deve sugerir disponibilidade atual.

### SEO

- 11 páginas públicas têm title, description, canonical e exatamente um H1.
- `styleguide.html` é interno/noindex e não tem canonical ou description, coerente com o objetivo.
- Sitemap contém 9 URLs e robots bloqueia o styleguide.
- Nenhuma página declara hreflang, apesar de o conteúdo usar PT/EN/IT/HR em runtime.
- A implementação por substituição client-side não cria URLs indexáveis por idioma; portanto, não satisfaz SEO internacional.
- JSON-LD existe em 8 páginas; política, blog, área do cliente e styleguide não o têm. Nem todas precisam de schema, mas a cobertura deve ser decidida por tipo de página.
- Open Graph não está completo em todas as páginas.

### Acessibilidade

- Todas as rotas observadas têm um H1, `lang=pt-PT` e imagens sem ausência de `alt`.
- Não houve erros de consola nas rotas e viewports observados.
- Foram detetados alvos interativos inferiores a 44×44 em todas as páginas; no mobile variam de 3 a 28.
- O drawer móvel permanece fora do viewport quando fechado, sem aumentar o `scrollWidth`; o defeito real de overflow vem do conjunto visível de ações do header.
- Contraste e estados de foco precisam de medição automatizada/visual dedicada na fase de correção; esta auditoria não declara WCAG completa.

### Responsividade e QA visual

Viewports inspecionados: `1440x900`, `1024x768`, `768x1024`, `390x844` e `360x800`.

- Desktop e tablet: sem overflow horizontal nas 12 rotas.
- Mobile 390: 9 de 12 rotas têm overflow; a recolha CDP reproduz 390 px de viewport e 417 px de documento. As capturas manuais anteriores registaram 375/416 px por efeito da barra de scroll.
- Rotas sem o defeito: `crm-gestao.html`, `politica-privacidade.html` e `styleguide.html`.
- Causa observada: `.header__actions` e `.mobile-toggle` ultrapassam o limite direito.
- O toggle móvel alterou `aria-expanded` de `false` para `true` e abriu o drawer sem erros de consola.
- A automação do navegador não moveu o foco com Tab de forma observável; a sequência de teclado fica inconclusiva e deve ser repetida manualmente/axe na missão de correção.
- Não foram feitas correções por a fase proibir alterações em páginas vivas.

### Motion

- Motion atual usa CSS, IntersectionObserver, tilt/pointer e vídeo lazy, com caminhos para `prefers-reduced-motion` e touch.
- O orçamento é mais proporcional que o legado Three/GSAP, mas os assets GLB históricos e código legado ainda confundem a arquitetura.
- O efeito de tilt e scroll-driven animations precisa de teste dedicado em reduced-motion e dispositivos lentos antes de nova expansão.

### Performance

- Assets em `src/`: ~28,7 MB; GLB histórico: ~23,1 MB; media raster/vídeo: ~5,1 MB; CSS: ~117,7 KB; JS: ~111,1 KB.
- A página principal faz lazy-load do vídeo e usa fontes self-hosted.
- Não existe uma suite Lighthouse/trace no repositório.
- O ambiente não possui o MCP Chrome DevTools exigido pelo gate de performance. Nenhum número de LCP, CLS, TBT ou Lighthouse é apresentado como medição atual.
- Os números históricos de PageSpeed são evidência documental, não baseline reproduzido nesta execução.

## Achados classificados

| ID | Severidade | Domínio | Achado | Evidência/impacto |
|---|---|---|---|---|
| F1-01 | Critical operacional | Release | `main` desprotegida e push aciona deploy FTP | Um push errado publica produção; usar branch explícita, proteção e gate humano |
| F1-02 | Important | Responsive | Overflow horizontal em 9/12 rotas mobile | Recolha CDP: 390 px → 417 px; capturas manuais: 375 px → 416 px |
| F1-03 | Important | Acessibilidade | Alvos abaixo de 44×44 em todas as rotas | 3–28 alvos por página mobile |
| F1-04 | Important | SEO internacional | Zero hreflang e idiomas sem URLs próprias | Tradução runtime não produz páginas indexáveis por mercado |
| F1-05 | Important | Qualidade | Nenhuma suite de testes real | `npm test` falha por design |
| F1-06 | Important | Arquitetura | `node_modules` e 23,1 MB de GLB histórico versionados | Repositório pesado, fonte canónica ambígua e risco de manutenção |
| F1-07 | Important | Conteúdo/produto | Visão A BRANCT/Chat IA/BRANCT OS ausente | Oferta futura não tem narrativa nem status/gates claros |
| F1-08 | Moderate | Arquitetura | CSS/JS e convenções duplicadas | shared CSS + inline/legado; responsabilidades amplas em `branct.js` |
| F1-09 | Moderate | SEO | OG/schema inconsistentes | Cobertura varia entre páginas; falta matriz por tipo |
| F1-10 | Moderate | Performance | Sem trace de performance reproduzível no CI | O baseline DOM/visual é reproduzível; números históricos não substituem Lighthouse/trace atual |
| F1-11 | Minor | Documentação | `AUDIT.md` e `CLAUDE.md` têm descrições obsoletas | sitemap/robots/schema e páginas light já existem |

## Documentação desatualizada

- “Páginas antigas continuam dark”: não corresponde à `main` observada; todas as páginas públicas carregam `branct.css` ou têm tratamento light.
- “schema.org zero”: existem oito páginas com JSON-LD.
- “sitemap/robots não existem”: ambos existem e são válidos sintaticamente.
- “servicos/blog/área são stubs”: hoje têm layout e metadados; blog continua funcionalmente “em breve” e área continua porta demonstrativa.
- “Three/GSAP ativos no site principal”: os ficheiros históricos permanecem no Git, mas a arquitetura light observada não os usa nas páginas auditadas.
- A branch `redesign-light-2026` está atrás da `main`; o seu head é ancestral da base auditada.

## Fontes de contexto consultadas

- Repositório do site: `CLAUDE.md`, `AUDIT.md`, spec de 2026-05-12 e código atual.
- BRANCT OS read-only: `context/products/branct-websites.md`, `branct-crm.md`, registo de portfólio, arquitetura da força de trabalho e spec do Chat IA.
- Conclusão normativa: A BRANCT é futura Diretora-Geral digital/cérebro institucional; Chat IA é interface; CRM e sites são superfícies/produtos distintos; nenhuma integração ou disponibilidade futura deve ser inferida.

## Limitações

- Sem submissão de formulários ou smoke contra endpoints.
- Sem credenciais, dados reais ou consola de produção.
- Sem trace Chrome DevTools/Lighthouse reproduzido.
- Chromium local apenas; Firefox/WebKit permanecem para uma fase de correção.
- A auditoria visual usa fixtures e conteúdo já presentes no repositório.

## Gate

Esta entrega é documentação e prova offline. Não autoriza redesign, migração, ativação de integrações, deploy ou merge.
