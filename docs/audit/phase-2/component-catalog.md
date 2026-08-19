# Catálogo constitucional de componentes

Status: especificação futura, **não implementação**. A lista estruturada em `f2-00-contract.json` é o contrato executável. Todo componente precisa de variantes, estados, acessibilidade, comportamento responsivo e limite anti-template antes de entrar em páginas.

## Inventário atual → contrato alvo

| Superfície observada | Local atual | Família/variante alvo | Estado |
|---|---|---|---|
| Header, navegação e skip link | HTML partilhado + `branct.css`/`branct.js` | header-navigation / institutional | CURRENT_VERIFIED, requer QA |
| Toggle e drawer mobile | HTML partilhado + `setupDrawer` | mobile-menu / drawer | CURRENT_VERIFIED com defeitos medidos |
| Seletor de idioma | `.lang-selector` | header-navigation / language-listbox | contrato completo `NOT_VERIFIED` |
| Submenu de serviços | `.services-submenu`, `.mobile-submenu` | header-navigation / services-disclosure | teclado `NOT_VERIFIED` |
| Consent banner | `.consent` e JS associado | feedback / consent-gate | runtime `NOT_VERIFIED` |
| Preview de casos | `setupCasePreview` | media-frames / case-preview | comportamento `NOT_VERIFIED` |
| Vídeo lazy | `[data-lazy-video]` | media-frames / lazy-video | comportamento `NOT_VERIFIED` |
| Tilt/reveal/scroll FX | CSS/JS existentes | media/cards / optional-effect | experiência `NOT_VERIFIED` |

O owner futuro é o agente da Issue que reservar o ficheiro; não há owner implícito. Um item `NOT_VERIFIED` não pode ser promovido a variante pronta sem teste.

## 1. Header e navegação

- Variantes: institucional, produto, transparente sobre media, language-listbox e services-disclosure.
- Estados: rest, scrolled, current, hover, focus-visible e disabled.
- Acessibilidade: skip link antes do header, `nav` nomeada, `aria-current="page"`, ordem de foco igual à ordem visual.
- Responsivo: navegação completa só enquanto links e ações mantiverem targets ≥44×44 e sem compressão; depois colapsa.
- Anti-template: densidade e CTA dependem da decisão da página; mega-menu não existe sem arquitetura de informação aprovada.

## 2. Menu mobile

- Variantes: drawer por defeito; full-screen apenas se a profundidade de navegação justificar.
- Estados: closed, opening, open, closing, focus-visible e blocked.
- Acessibilidade: acionador com `aria-controls` e `aria-expanded`; Escape fecha; foco retorna ao acionador; foco não entra no conteúdo bloqueado.
- Responsivo: cabe integralmente em 360×800, suporta zoom/reflow e bloqueia scroll do body somente quando o overlay exige.
- Anti-template: sem takeover decorativo, animação longa ou links sociais vazios.

## 3. Botões e CTAs

- Variantes: agency-primary, crm-primary, secondary, tertiary e icon-only.
- Estados: rest, hover, active, focus-visible, loading, disabled e success.
- Acessibilidade: mínimo 44×44; nome acessível em icon-only; loading mantém contexto e evita duplo submit.
- Responsivo: full-width é decisão de hierarquia, não regra mobile; label essencial não trunca.
- Anti-template: um CTA dominante por região decisória; cor comunica intenção aprovada de agência/CRM.

## 4. Cards

- Variantes: editorial, serviço, produto, case study e métrica.
- Estados: rest, hover, focus-visible, selected, disabled e blocked.
- Acessibilidade: heading semântico; link total não contém controlos interativos aninhados; estado não depende de hover.
- Responsivo: altura segue conteúdo; grid reflowa sem vazios de equal-height e preserva ordem DOM.
- Anti-template: nem toda secção vira grelha de cards; composição, prova e densidade devem variar pela narrativa.

## 5. Formulários

- Variantes: contacto, lead, pesquisa e settings-demo.
- Estados: rest, focus-visible, valid, error, loading, success, disabled e blocked.
- Acessibilidade: labels persistentes, instruções antes da entrada, erro ligado por `aria-describedby`, summary focável em falha.
- Responsivo: uma coluna estreita; `autocomplete`, input purpose e teclado virtual corretos; mensagens não criam overflow.
- Anti-template: recolher somente dados necessários; demos não submetem dados nem simulam sucesso vivo.

## 6. Frames de imagem e vídeo

- Variantes: editorial-image, product-screen, video, comparison, case-preview, lazy-video e optional-effect.
- Estados: loading, loaded, error, playing, paused e blocked.
- Acessibilidade: alt significativo ou decorativo explícito; controlos de vídeo por teclado; legendas/transcrição para informação falada.
- Responsivo: aspect ratio reservado; crop nunca remove UI essencial; poster e fallback disponíveis.
- Anti-template: imagem real aprovada prevalece; stock não serve de prova; perspetiva/3D precisa de propósito e fallback.

## 7. Preços e ofertas

- Variantes: single-offer, comparison, subscription e bespoke.
- Estados: available, recommended, beta, future, unavailable e blocked.
- Acessibilidade: moeda, período, impostos/condições e diferenças legíveis sem cor; heading e listas comparáveis.
- Responsivo: comparação vira grupos rotulados, não tabela horizontal ilegível.
- Anti-template: “recomendado” exige decisão comercial real; future/unavailable não recebe CTA de compra.

## 8. Tabs e accordions

- Variantes: tabs, accordion e disclosure.
- Estados: collapsed, expanded, selected, focus-visible e disabled.
- Acessibilidade: padrão ARIA correspondente; setas nas tabs; Enter/Space em disclosure; headings permanecem navegáveis.
- Responsivo: tabs só viram accordion com semântica, estado e conteúdo equivalentes.
- Anti-template: não esconder conteúdo para encurtar página; estado inicial segue a tarefa do utilizador.

## 9. Badges e estados

- Variantes: available, beta, future, demo, restricted e error.
- Estados: static, interactive, focus-visible e disabled.
- Acessibilidade: significado em texto; cor e ícone são redundantes, não exclusivos.
- Responsivo: badge quebra linha sem sobrepor título ou ação.
- Anti-template: estado vem de verdade de produto aprovada; sem “new”, “AI” ou “beta” como ornamento.

## 10. Footer

- Variantes: institucional, produto e minimal-legal.
- Estados: rest, link-hover, focus-visible e restricted-link.
- Acessibilidade: landmark `contentinfo`, nomes de links descritivos, contacto/legal sempre alcançáveis.
- Responsivo: grupos empilham por prioridade; headings não ficam órfãos.
- Anti-template: colunas refletem páginas existentes; sem redes sociais, mercados ou produtos inventados.

## 11. Feedback loading, vazio, erro, sucesso e bloqueio

- Variantes: inline, section, page, toast e consent-gate.
- Estados obrigatórios: loading, empty, error, success, blocked, focus-visible e disabled.
- Acessibilidade: `aria-live` conforme urgência; erro persistente não vira toast efémero; ação de recuperação é alcançável; loading não prende foco.
- Responsivo: mensagem, causa e ação permanecem visíveis em 360 px; skeleton reserva a geometria final.
- Anti-template: cada mensagem explica estado real e próximo passo; sem progresso falso, empty state promocional ou success antes de confirmação.

## Regra transversal de composição

Uma revisão anti-template reprova quando três ou mais secções consecutivas repetem a mesma composição card-grid sem necessidade narrativa; uma variante não tem conteúdo/estado real; imagem stock é apresentada como prova; mais de um CTA recebe dominância equivalente na mesma região; ou um `optional-effect` não tem hipótese, orçamento e fallback reduced-motion registados. O parecer identifica rota, secção e regra violada.

Componentes são vocabulário, não layout pronto. Uma página não pode ser montada por repetição automática de hero + três cards + logos + pricing + FAQ. O responsável documenta quais componentes reutiliza, quais omite e como narrativa, proporção, imagem e ritmo tornam aquela página específica sem quebrar o sistema.
