# Constituição visual BRANCT — Fase 2

Status: **APPROVED_DECISION CANDIDATE**; vinculativa somente após aprovação humana e merge próprio. Este documento define qualidade e limites para futuras implementações. Não implementa componentes, não altera páginas e não autoriza F2-01, deploy ou produção. O contrato operacional verificável está em `f2-00-contract.json`.

## 1. Posição e promessa visual

A BRANCT deve parecer uma empresa digital premium capaz de vender pela precisão da própria experiência. Premium significa clareza editorial, domínio técnico, detalhe silencioso e prova concreta — não luxo ornamental. A experiência deve atingir qualidade visual internacional para Europa e Brasil, sem aparência de template, sem gradientes genéricos, sem mosaicos repetitivos de cards e sem “tech theatre”.

Cada decisão deve responder a uma destas funções: orientar, explicar, demonstrar, converter ou dar feedback. Elementos sem função são removidos. A densidade alterna deliberadamente entre informação e silêncio; uma página não é avaliada pelo número de efeitos ou secções.

## 2. Arquitetura de marca e produtos

| Superfície | Papel | Atmosfera | Proibição |
|---|---|---|---|
| Agência BRANCT | Estratégia, execução e relação comercial | Editorial, humana, segura, com ink dominante | Não parecer consultoria genérica nem portfólio de template |
| CRM | Produto operacional com protagonismo próprio | Precisa, modular, orientada a produto; teal funcional | Não inferir integrações, métricas ou disponibilidade não verificadas |
| Chat IA | Interface conversacional futura | Clara, responsiva, centrada em diálogo e controlo humano | Não confundir a interface com o cérebro institucional; runtime é NON_EXISTENT neste site |
| A BRANCT | Futura diretora digital/camada de coordenação | Institucional, serena, sistémica; roxo apenas como contexto controlado | Não apresentar como agente ativo, autónomo ou disponível sem missão própria |
| Produtos futuros/nichos | Extensões com estado explícito | Variação de ritmo, narrativa e cor dominante dentro do sistema | Não reciclar a mesma landing nem oferecer CTA de compra a estado futuro |

Estados de produto são texto verificável: `available`, `beta`, `demo`, `future`, `restricted` ou `unavailable`. Cor nunca substitui o rótulo. Propostas futuras não contam como funcionalidades existentes.

## 3. Direção editorial e imagens

- A narrativa começa pela tensão real do cliente, mostra método e prova, e termina numa decisão proporcional; não começa por slogans abstratos.
- Uma secção tem uma ideia dominante. Títulos curtos podem ser expressivos; corpo de texto deve ser concreto, profissional e comercial.
- Imagens reais aprovadas de produto, equipa, processo e trabalho têm prioridade. Screenshots devem representar estado verificável, com dados pessoais removidos.
- Stock só é admissível como contexto editorial, nunca como prova de trabalho, cliente ou produto.
- Frames preservam proporção, reservam espaço antes do carregamento e usam art direction sem cortar informação essencial.
- Vídeo informativo requer poster, controlos, legenda/transcrição quando aplicável e fallback estático. Autoplay com som é proibido.
- Não inventar logos, testemunhos, números, dashboards, integrações ou resultados.

## 4. Tipografia e legibilidade

Os valores operacionais estão decompostos por propriedade em `f2-00-contract.json`; tamanho, line-height, tracking e peso nunca formam uma pseudo-declaração única. O contrato adota os valores atuais de `branct.css` onde existem (`--line`, raios, durações e breakpoints 720/940 px) e marca adições como `target-only`. Documentação não pode alegar que tokens target-only já estão implementados.

Bricolage Grotesque é display e Manrope é texto. A escala canónica está em `f2-00-contract.json`; implementações devem consumir tokens, não números locais arbitrários.

- Display usa peso e tracking para voz, nunca para compensar copy fraco.
- Corpo padrão mantém `1rem/1.6`; texto comercial longo limita-se ao contentor de leitura de `44rem`.
- Labels em uppercase são curtas, com tracking explícito, e não carregam informação essencial isoladamente.
- Linhas de texto devem permanecer aproximadamente entre 45 e 75 caracteres; evitar colunas largas e texto centrado longo.
- Hierarquia semântica e visual devem concordar. Cada rota mantém um H1; níveis não são escolhidos por tamanho.
- Zoom a 200% e reflow a 320 CSS px não podem perder conteúdo ou função.

## 5. Cor e contraste

As cores são papéis, não decoração. Canvas e superfícies formam a base clara; ink estrutura; teal indica ações/contexto do CRM; roxo identifica contexto IA/A BRANCT com parcimónia. Estados de sucesso, aviso e erro têm papéis próprios.

- Texto normal exige contraste mínimo 4.5:1; texto grande 3:1; componentes, limites relevantes e foco 3:1.
- `focus-ring` não pode ser substituído por mudança subtil de cor.
- Acentos não criam arco-íris por página. Uma página pode eleger uma cor dominante e uma cor de estado, preservando ink, superfícies e semântica comum.
- Teal ou roxo não autorizam disponibilidade de produto. Todo significado também aparece em texto/ícone acessível.
- Combinações finais são medidas no contexto real; os valores constitucionais são candidatos vinculativos, não prova automática de contraste em qualquer composição.

### Dívida de claims e verdade do produto

A árvore viva contém claims afirmativos em `website-premium.html` e `automacao-ia.html` sobre CRM/WhatsApp 24/7, APIs/webhooks, alojamento na UE e RGPD. A auditoria offline não os verificou. A constituição classifica-os como dívida de compliance `OPEN_NOT_VERIFIED`: a F2-01 congela narrativa e não pode corrigi-los; uma missão separada e explicitamente autorizada deve verificar, qualificar ou remover cada claim antes de ele orientar design ou venda. Congelar copy não converte um claim em verdade.

## 6. Espaçamento, grid e ritmo

- Escala de spacing: 4, 8, 12, 16, 24, 32, 48, 64 e 96 px equivalentes, mais secção fluida `clamp(4.5rem, 10vw, 9rem)`.
- Contentores: leitura `44rem`, padrão `72rem`, wide `90rem`; gutter fluido `clamp(1rem, 4vw, 4rem)`.
- Grid: 12 colunas desktop, 8 tablet, 4 mobile. O conteúdo pode quebrar o grid apenas com intenção editorial documentada.
- Ritmo vertical segue relações: label→título menor que título→corpo; corpo→ação menor que secção→secção.
- Não forçar cards à mesma altura quando isso cria vazio artificial. Não usar margem negativa para ocultar falhas de estrutura.
- O layout deve falhar fechado: sem overflow horizontal, corte, sobreposição ou conteúdo fora da ordem DOM.

## 7. Raios, bordas, sombras e profundidade

- Raios `sm/md/lg/xl/pill` correspondem a controlo, card, frame, superfície editorial e elemento realmente capsular. `pill` não é estilo universal.
- Hairline separa regiões próximas; borda forte delimita controlo/estado. Não empilhar borda, sombra e fundo apenas para “dar design”.
- `shadow-rest` indica separação discreta; `shadow-raised` é reservada a elementos temporariamente elevados ou hero media.
- Profundidade resulta primeiro de escala, sobreposição semântica e contraste; sombra é o último recurso.
- Vidro, blur e translucidez exigem fallback legível e medição de performance.

## 8. Breakpoints e comportamento responsivo

Viewports mínimos obrigatórios: `1440×900`, `1024×768`, `768×1024`, `390×844` e `360×800`. Breakpoints são definidos pelo ponto de falha do conteúdo, não por modelos de dispositivo.

- Wide: navegação completa e grid de 12 colunas quando couber sem comprimir targets.
- Tablet: 8 colunas, redução de densidade e reordenação apenas quando a ordem DOM continua correta.
- Mobile: 4 colunas, targets ≥44×44 CSS px, texto e ações sem truncar e zero overflow.
- Mudança de layout não pode esconder conteúdo essencial. Tabs podem virar accordion apenas com semântica e estado equivalentes.
- Orientação e zoom devem manter função. `100vw` não é usado dentro de contentores com scrollbar sem justificação.
- Firefox e WebKit/Safari são `NOT_VERIFIED` até execução real; compatibilidade não pode ser inferida de Chromium.

## 9. Camadas e z-index

A escala fechada é: base 0, raised 10, sticky header 100, drawer backdrop 200, drawer 210, popover 300, toast 400, critical modal 500.

- Componentes não criam valores locais como 9999.
- Um stacking context novo exige motivo documentado.
- Drawer fica acima do header somente quando aberto; backdrop nunca cobre o próprio diálogo.
- Toast não substitui erro persistente de formulário. Modal crítico é raro e não é mecanismo de marketing.

## 10. Motion e orçamento de movimento

Motion explica relação, mudança de estado ou prioridade. O orçamento por viewport permite uma animação de ênfase simultânea; feedback de controlo pode coexistir se não competir.

- Durações: 80 ms instant, 160 ms fast, 240 ms standard, 420 ms emphasis. Nada de entrada editorial acima de 600 ms.
- Easings: standard para mudanças locais, enter para revelar, exit para remover. Evitar bounce em tarefas sérias.
- Preferir `transform` e `opacity`; não animar propriedades de layout por defeito.
- Scroll motion não controla leitura, não prende scroll e não esconde conteúdo sem JavaScript.
- `prefers-reduced-motion: reduce` remove deslocamento, parallax, tilt, autoplay e scroll-driven motion, preservando conteúdo, hierarquia e feedback equivalente.
- Loading não usa movimento infinito quando progresso ou skeleton estático comunica melhor.

## 11. 3D e efeitos especiais

3D, parallax, tilt, brilho e vídeo não são decorativos por defeito. Só entram quando demonstram produto, materializam uma relação espacial ou aumentam compreensão/desejo mensurável.

Para aprovação, um efeito deve declarar propósito, fallback, custo de bytes/main-thread/GPU, comportamento touch, comportamento com movimento reduzido e critério de remoção. Efeitos que atrasem interação, prejudiquem leitura, provoquem layout shift ou dependam de precisão do ponteiro são removidos. O histórico Three/GLB do repositório não constitui autorização para reutilização.

## 12. Acessibilidade e qualidade

- Mínimo WCAG 2.1 AA; objetivo WCAG 2.2 AA.
- Teclado completo, foco visível, landmarks, nomes acessíveis, heading order e mensagens de estado são gates, não melhorias opcionais.
- Targets mínimos 44×44 CSS px, com espaçamento que evite ativação acidental.
- Conteúdo e função não dependem só de cor, hover, motion, som ou gesto complexo.
- Erros identificam campo, causa e recuperação; foco é movido somente quando melhora orientação.
- Critérios de performance seguem a Fase 1: LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.10; alvo premium ≤1.8 s/100 ms/0.05 quando mensurável.
- Sem execução real, Lighthouse, Firefox, WebKit, contraste contextual e WCAG completa permanecem `NOT_VERIFIED`.

## 13. Diferenciação sem fragmentação

Consistência vem de tipografia, tokens, grid, interação e voz. Diferenciação vem de narrativa, ritmo, proporção, art direction, composição e acento dominante. A homepage não é um molde para páginas de produto; CRM não é uma página de agência recolorida; A BRANCT não é um chat com outro nome.

Antes de criar uma página, o handoff deve declarar: objetivo comercial, audiência, decisão principal, prova disponível, estado do produto, atmosfera, composição distinta e componentes reutilizados. Se estas respostas não existirem, o design permanece bloqueado.

## 14. Gate de alteração

Esta constituição não autoriza implementação. Qualquer alteração visual exige missão própria, RED→GREEN, branch/worktree isolada, inspeção real nos cinco viewports, revisão independente, CI no head exato e aprovação humana vinculada a head/base. Produção e deploy permanecem bloqueados por defeito.
