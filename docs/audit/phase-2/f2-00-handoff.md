# F2-00 — registo de estado e handoff

## Escopo e autoridade

Esta missão corrige memória, estabelece constituição visual, catálogo, governança e especificação futura. Não altera nem autoriza HTML, CSS, JavaScript ou assets publicados; deploy, manifesto, integrações, secrets e produção permanecem bloqueados.

## Confronto entre documentação e árvore

| Afirmação anterior | Evidência atual | Classificação F2-00 |
|---|---|---|
| Apenas três páginas tinham migrado para a apresentação light | 10 das 12 rotas carregam `branct.css`; CRM e política são standalone | Desatualizada; corrigida no `CLAUDE.md` |
| As restantes páginas usavam `main.css`/`main.js`, dark, GSAP e Three.js | Nenhuma rota HTML carrega esses ficheiros ou bibliotecas; os artefactos continuam rastreados | Desatualizada; presença no repositório não prova runtime |
| Home tinha hero 3D | A home atual não carrega Three.js | Desatualizada |
| Blog e serviços eram stubs | As rotas têm conteúdo/layout; essa classificação já não é suportada | Desatualizada |
| Sitemap, robots e schema estavam ausentes | `sitemap.xml`, `robots.txt` e JSON-LD em 8 rotas existem | Histórico legítimo, mas não é estado atual |
| Leads, CRM, Supabase, n8n e Pixel funcionam como descrito | A auditoria offline não executou integrações ou produção | `NOT_VERIFIED` |
| `main` é protegida tecnicamente | API da branch respondeu `Branch not protected` | Falso; governança Via A/B pendente |
| A baseline mobile estava conforme | 9/12 rotas têm overflow; 390 px chega a 417 px; 3–28 alvos/rota abaixo de 44 px | Problema comprovado para futura F2-01 |

O `AUDIT.md` e o changelog são preservados como registo histórico. Quando divergem da árvore, não têm precedência sobre medição atual.

## Prontidão por área

| Área | Prontidão | Evidência / condição seguinte |
|---|---:|---|
| Memória operacional | 90% | Estados separados; integrações marcadas `NOT_VERIFIED`; validar continuamente contra a árvore |
| Constituição visual | 85% | Tokens, princípios, acessibilidade e limites definidos; falta validação em implementação real |
| Catálogo de componentes | 80% | 11 famílias e estados especificados; falta protótipo/teste de implementação |
| Governança | 70% | Via A e Via B documentadas; decisão humana permanece pendente |
| Evidência multiviewport | 85% | 60 medições e 13 capturas integradas; Firefox/WebKit `NOT_VERIFIED` |
| F2-01 | 35% | Critérios e plano prontos; execução não autorizada e defeitos continuam presentes |
| Deploy seguro | 90% | Política positiva + manifesto exato de 56 ficheiros; risco residual ao alterar o conjunto publicado |
| Produção e integrações | 0% | Fora do escopo; nenhuma verificação nem autorização |

Percentuais são estimativas de preparação documental, não percentuais de conclusão do produto.

Há ainda dívida de compliance `OPEN_NOT_VERIFIED`: `website-premium.html` e `automacao-ia.html` contêm claims de CRM/WhatsApp 24/7, APIs/webhooks, alojamento UE e RGPD que esta auditoria não comprovou. A F2-01 congela narrativa; uma missão separada deverá verificar, qualificar ou remover claims sob autorização humana.

## Decisão humana pendente

O Conselho deve escolher entre proteção técnica real da `main` (Via A, se conta/plano permitirem) e manutenção explícita do controlo processual compensatório (Via B). A F2-00 não escolhe nem representa as vias como equivalentes.

## Riscos residuais

- Documentação pode divergir novamente da árvore sem o contrato offline e revisão de diff.
- Tokens ainda não foram provados em páginas reais; inconsistências podem surgir na futura implementação.
- A ausência de proteção técnica deixa controlos processuais dependentes de disciplina humana.
- Chromium não substitui Firefox/WebKit; ambos continuam `NOT_VERIFIED`.
- A baseline demonstra defeitos reais que só a F2-01, se futuramente autorizada, poderá corrigir.

## Correção F2-00 F1 — motion

A escala documental de motion foi unificada com a árvore viva: `duration-fast=150ms`, `duration-standard=250ms` e `duration-emphasis=450ms`, todos `current`. `duration-instant` foi removido da escala e não é apresentado como implementado. O contrato offline extrai o bloco delimitado da constituição, compara nomes/valores/estados com o JSON e mantém negativos para divergência, ausência, extra não classificado e target-only falsamente apresentado como current.

## Correção F2-00 F2 — guardião fail-closed

O guardião exige igualdade exata entre os `duration-*` de `tokens.motion`, as chaves de `motionTokenStatus` e o bloco canónico. Não existe default de status. START e END aparecem exatamente uma vez e na ordem correta. Negativos isolados cobrem status ausente/órfão/inválido, marcadores ausentes ou duplicados, END antes de START, segundo bloco, linha inválida e token duplicado, preservando os cinco negativos F1.

## Rollback

Antes do merge, fechar a PR e preservar a branch. Depois de eventual merge humano, usar `git revert -m 1 <merge_sha>` e reexecutar contratos offline, proteção de deploy e auditoria. O rollback não autoriza FTP nem mudanças em produção.
