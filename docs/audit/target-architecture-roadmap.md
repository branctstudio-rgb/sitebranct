# Arquitetura-alvo e roadmap

## Princípios

1. Manter URLs e stack estática até uma decisão arquitetural própria.
2. Separar conteúdo, apresentação, comportamento e tracking por contratos testáveis.
3. Uma fonte de tokens, componentes e navegação; variação por página através de temas e composição, não cópia.
4. Conteúdo internacional por URL/mercado, com canonical e hreflang recíproco.
5. Integrações isoladas atrás de gates; o frontend funciona com fixtures quando offline.
6. A BRANCT é a futura Diretora-Geral digital; Chat IA é uma interface; CRM, sites e serviços são produtos/superfícies com estados de disponibilidade explícitos.
7. Área do cliente e chat permanecem demos visuais até missões próprias aprovarem runtime.

## Camadas propostas

- Foundation: tokens, fontes, reset, grid, acessibilidade e motion budget.
- Components: header, footer, CTA, cards, forms, tabs, accordions, pricing e media frames.
- Content model: mensagens, provas, produtos, planos, mercados, nichos e estados (disponível/beta/futuro).
- Pages: institucional, produtos, A BRANCT, nichos, pricing e demos.
- Offline fixtures: CRM, chat e área do cliente sem dados reais ou chamadas externas.
- Quality: contratos, link/meta validation, screenshots, axe/Lighthouse e budgets.
- Delivery: preview de PR, proteção de branch e deploy somente após aprovação humana.

## Roadmap faseado

Percentuais são estimativas de prontidão observada, não progresso comercial.

| Fase | Resultado | Prontidão estimada | Gate de entrada |
|---|---|---:|---|
| 1. Auditoria offline | Baseline, contrato, riscos e roadmap | 100% | PR draft e revisão humana |
| 2. Fundação e design system | Tokens/componentes únicos, header responsivo, motion budget, testes | 60% | Aprovação visual + branch protegida |
| 3. Institucional premium | Home, serviços, processo, contactos, blog e legal consolidados | 65% | Conteúdo real aprovado |
| 4. Produtos e ofertas | Sites, CRM, marketing, tráfego, IA, automações, avulsos e assinaturas | 40% | Matriz de disponibilidade e preços validada |
| 5. A BRANCT e Chat IA demo | Narrativa da diretora digital + interface com fixtures sintéticas | 15% | Gate Chat IA/DEV; zero runtime vivo |
| 6. Nichos e área cliente demo | Experiências adaptáveis e portal apenas demonstrativo | 20% | Taxonomia de nichos e fixtures aprovadas |
| 7. Internacionalização/SEO | URLs por mercado, hreflang, schema e sitemap por locale | 30% | Mercados, idiomas e ownership editorial |
| 8. PWA/app readiness | Manifest, shell, offline policy e arquitetura partilhável | 10% | Decisão de produto e segurança |
| 9. Hardening/release | Lighthouse/axe/cross-browser, proteção Git e rollback ensaiado | 20% | Ambiente de preview sem produção |

## Sequência recomendada

1. Corrigir release safety e criar CI de qualidade.
2. Corrigir header mobile e targets touch em missão isolada RED→GREEN.
3. Consolidar componentes/tokens sem alterar narrativa.
4. Aprovar arquitetura de informação, catálogo, estados e mercados.
5. Construir páginas de produtos e A BRANCT com fixtures.
6. Implementar URLs internacionais e PWA apenas após decisão própria.

## Critérios futuros

- Viewports mínimos: 1440×900, 1024×768, 768×1024, 390×844 e 360×800.
- Zero overflow e targets BRANCT ≥44×44.
- WCAG 2.1 AA; objetivo interno WCAG 2.2 AA.
- Lighthouse mínimo 95/95/95/95; alvo 98/100/100/100.
- LCP ≤2,5 s, INP ≤200 ms, CLS ≤0,10; alvo premium ≤1,8 s/100 ms/0,05.
- Sem conteúdo, prova social ou integrações inventadas.

## Fora de escopo

Deploy, Supabase, n8n, CRM runtime, Memória Central, pagamentos, ferramentas, clientes, widget funcional e dados reais.
