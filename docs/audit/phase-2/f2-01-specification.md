# F2-01 — especificação verificável

Estado: `F2_01_AUTORIZADA_EM_DESENVOLVIMENTO`, ainda não integrada. Esta autorização admite somente desenvolvimento e validação em PR; não autoriza merge, deploy ou produção.

## Problema comprovado

A baseline integrada da Fase 1 cobre 12 rotas em 5 viewports. Em mobile, 9 das 12 rotas apresentam overflow horizontal; numa viewport de 390 px, a largura medida chega a 417 px. As rotas apresentam entre 3 e 28 alvos interativos abaixo de 44 px. O trabalho seguinte limita-se a header mobile, overflow e touch targets, sem alterar narrativa, hierarquia editorial ou identidade.

## Matriz obrigatória

Cada rota deve ser medida em processos novos de cada navegador obrigatório nas viewports:

- 320×568
- 412×915
- 1440×900
- 1024×768
- 768×1024
- 390×844
- 360×800

Isso produz 84 observações conclusivas por engine. Chromium, Firefox e WebKit são obrigatórios, nas versões/builds fixados pelo runtime protegido. Engine ausente, ignorada, divergente, parcial ou inconclusiva bloqueia a elegibilidade; compatibilidade nunca é inferida.

## Contrato multiengine v3

`fixtures/audit/f2-01-baseline-results-v3.json` é a autoridade semântica canónica. A baseline v2 anterior permanece imutável como snapshot observacional e não autoriza readiness. Cada relatório deve declarar `conclusion: CONCLUSIVE`, cobrir exatamente 84 observações, 41 exercícios de menu e 184 ações e corresponder um-a-um às identidades canónicas protegidas.

O gate recalcula predicados a partir das medições brutas: overflow, alvos 44×44, operação do menu, foco, `inert`, scroll lock, reduced motion e conclusão da execução. Geometria continua obrigatória, finita, não negativa e internamente coerente, mas diferenças legítimas de layout/rounding entre engines não são comparadas byte a byte nem por uma tolerância global arbitrária. Metadados como data, caminho e mensagem são apenas sanitizados; nunca autorizam GREEN.

Capturas fechada/aberta exigidas por engine e viewport são lidas e hasheadas pelo verificador. Ausência, vazio, duplicação, digest inválido, infraestrutura incompleta ou relatório parcial falham fechado.

## RED mensurável

Antes de qualquer correção, o teste deve falhar quando `scrollWidth > clientWidth`, quando um alvo acionável mede menos de 44×44 CSS px, ou quando o contrato comportamental do menu não é cumprido. O relatório deve identificar rota, viewport, seletor/elemento, dimensões e estado observado. Capturas antes e resultados brutos devem ser preservados.

## GREEN e critérios de aceitação

O gate exige simultaneamente:

1. Zero overflow horizontal nas 12 rotas e em todas as cinco viewports.
2. Todos os alvos interativos com pelo menos 44×44 CSS px, incluindo ícones, toggles e controlos do seletor de idioma.
3. Header e menu mobile operáveis por teclado, sem armadilhas de foco.
4. Foco visível com contraste e área perceptíveis.
5. `aria-expanded` sincronizado com o estado real do menu.
6. `Escape` fecha o menu e o foco retorna ao acionador.
7. Bloqueio de scroll do `body` enquanto o drawer modal estiver aberto, quando necessário, com restauração do estado anterior ao fechar.
8. Nenhum conteúdo escondido, truncado ou tornado inacessível pela correção.
9. Nenhuma alteração de narrativa, claims, ordem editorial ou conteúdo comercial.
10. Nenhum erro novo de consola.
11. Suporte a `prefers-reduced-motion`, mantendo informação e operação equivalentes.
12. Capturas antes/depois e evidência reproduzível, associadas ao SHA, rota e viewport.

## Oráculos executáveis

- **Overflow:** nas 60 entradas, `document.documentElement.scrollWidth <= document.documentElement.clientWidth`; qualquer diferença positiva lista os elementos cujo retângulo sai da viewport.
- **44×44:** inventariar `a[href]`, `button`, inputs visíveis, `select`, `textarea`, `[role=button]`, `[role=tab]` e `[tabindex]:not([tabindex="-1"])`; cada retângulo visível deve ter largura e altura ≥44 CSS px. Ocultos são classificados, não descartados silenciosamente.
- **Teclado:** Tab alcança toggle; Enter e Space abrem; `aria-expanded=true`; foco entra no drawer; Tab/Shift+Tab respeitam a modalidade; Escape fecha; `aria-expanded=false`; foco volta ao toggle.
- **Foco visível:** cada alvo inventariado demonstra indicador com contraste ≥3:1, espessura mínima 2 CSS px e área ao menos equivalente a um perímetro de 2 px.
- **Conteúdo não escondido:** comparar headings, landmarks, links e texto não vazio antes/depois; contagens e strings normalizadas são iguais, exceto atributos ARIA autorizados.
- **Narrativa congelada:** `git diff --word-diff=porcelain` não adiciona/remove texto visível, title, description, JSON-LD, alt ou chaves i18n; HTML fica limitado a atributos/estrutura acessível reservados.
- **Reduced motion:** com `prefers-reduced-motion: reduce`, animações/transições computadas no header/drawer ficam `0s` ou `none`; operação, foco e conteúdo permanecem equivalentes.
- **Consola:** zero novos `error`/`warning`, guardando tipo, rota e viewport.

## Contrato do menu

O acionador precisa de nome acessível, `aria-controls` válido e `aria-expanded="false"` no estado fechado. Abrir o menu move o foco para um destino previsível; Tab e Shift+Tab permanecem coerentes com a modalidade adotada; Escape fecha; clique fora só pode complementar, nunca substituir, a operação por teclado. Ao fechar, o acionador recupera o foco. Conteúdo por trás do drawer não pode receber interação quando o drawer funcionar como modal.

## Evidência e fail-closed

Uma rota, viewport ou medição ausente reprova o gate. Timeout, erro de consola do coletor, imagem vazia, baseline alterada sem justificação ou resultado de motor não executado também reprovam. O relatório deve distinguir falha do produto de falha da infraestrutura.

## Fora de escopo

Redesign, nova narrativa, componentes novos, migração visual, integrações, CRM, Chat IA, pagamentos, assets editoriais, FTP, produção e alteração da proteção de deploy. Qualquer necessidade além da correção mínima volta ao gate humano.

## Pré-requisito de entrega

Os caminhos previstos da F2-01 acionam FTP quando integrados em `main`. Uma PR F2-01 pode ser construída e revista offline, mas **não pode ser fundida sob autoridade offline**. Antes de qualquer merge, o Conselho deve autorizar um mecanismo técnico separado — preview/staging sem credenciais de produção ou suspensão controlada do deploy — e aprovar explicitamente o efeito de publicação. “Ausência de deploy após merge de ficheiros vivos” não é uma promessa válida na arquitetura atual.
