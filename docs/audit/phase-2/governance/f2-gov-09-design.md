# F2-GOV-09 — enforcement operacional base-only

## Estado

`OPERATIONAL_CANDIDATE`, ainda não integrado nem ativo como autoridade da `main`. Esta PR altera componentes protegidos e deve permanecer bloqueada pela Gate Integrity Sentinel até cerimónia nominal futura.

## Modelo de confiança

| Elemento | Autoridade | Pode decidir PASS/FAIL? |
|---|---|---:|
| Evento `pull_request` | ficheiro de evento do runner | não; fornece base/head/refs |
| Bootstrap | blob `scripts/governance/validate-f2-gov-08.mjs` do base SHA | sim, sobre integridade e completude |
| Contrato, manifesto, matriz, expectativas, runtime e baseline | objetos Git `100644 blob` do base SHA, com tamanho e SHA-256 pinados | sim |
| Consumidor e servidor | blobs materializados do base SHA | sim |
| Head da PR | somente HTML raiz e `src/{css,js,fonts,i18n,img}/**`, excluindo `src/img/video.mp4` | nunca |
| Playwright/browsers | lockfile do base + OCI pinada por digest | executa a medição; não define expectativas |
| Sentinel | workflow `pull_request_target` da base | bloqueia evolução não cerimonial da autoridade |

O produtor não fornece contrato, matriz, expectativas, identidade, digest, envelope ou resultado. O consumidor produz esses vínculos depois da observação, usando base, head, payload, engine, rota, viewport e ação canónicos.

## Sequência operacional futura

1. Checkout do head exato, sem credenciais persistidas.
2. Resolver base/head/refs do evento e exigir ancestralidade.
3. Materializar `package.json` e lockfile somente do base e instalar com scripts desativados num diretório isolado.
4. Materializar o bootstrap diretamente do blob do base.
5. O bootstrap carrega contrato, pins, consumidor, servidor, matriz, expectativas e autoridades auxiliares exclusivamente do base.
6. A árvore Git inteira do head é validada byte a byte antes de materialização: UTF-8/ASCII portátil, modo/tipo, colisões case-insensitive e hierárquicas, symlink/gitlink, traversal e nomes reservados.
7. Somente blobs vivos allowlisted são copiados para staging novo.
8. O servidor confiável escuta apenas `127.0.0.1`, serve somente blobs candidatos `100644` cujo tamanho e SHA-256 foram verificados e rejeita redirects, ambiguidades de path e mudança de origem. O contexto Playwright bloqueia e registra toda tentativa fora da origem exata do ensaio.
9. Chromium, Firefox e WebKit executam 84 observações, 41 identidades e 184 ações por engine.
10. O consumidor cria envelopes e digests após medir; relatório parcial, timeout, engine ausente ou inconclusão falham fechado.

## Evolução protegida desta própria PR

Existe um bootstrap transitório fechado somente para a base `3656d57a78b777b1ff279c2cda01905877611117`. Ele permite medir o candidato operacional no CI desta evolução, mas não substitui a Sentinel: o diff precisa ser exatamente o conjunto F2-GOV-09 fechado de 17 caminhos. A única página viva é `crm-gestao.html`; `fixtures/audit/f2-01-transition.json` e `tests/audit/site-audit.test.mjs` formam a autorização one-shot protegida, vinculada à mesma base e incapaz de admitir outra página ou ser reutilizada quando a base mudar. A Sentinel permanece deliberadamente vermelha. Após integração, qualquer PR normal usa exclusivamente o bootstrap do seu base SHA; as duas condições transitórias deixam de ser alcançáveis porque a base muda.

## Rede e credenciais

- Permissão do job: `contents: read`.
- Checkout: `persist-credentials: false`.
- Nenhum secret é referenciado.
- O processo do consumidor recebe ambiente vazio; os browsers recebem somente diretórios temporários locais.
- A análise estática é inventário complementar de capacidades, com ficheiro, linha, categoria e mecanismo. Ela não prova ausência de rede e uma URL externa dormente não recebe autorização de execução.
- Recursos locais são admitidos apenas na origem loopback exata e depois de corresponderem a um blob candidato `100644` verificado. O `fetch` real de `src/i18n/<lang>.json` precisa concluir com HTTP 200 no ensaio.
- Qualquer tentativa externa observada — HTTP(S), XHR, WebSocket, EventSource, beacon, Service Worker, script/import/frame/imagem, popup ou navegação — é impedida antes da saída, registrada com engine/fase/ação/URL e torna o relatório inválido. **Bloqueada não significa aprovada.**
- O contexto medido é encerrado antes dos probes. Cada probe usa contexto próprio, identidade derivada de base/head/payload/engine/ação e exatamente uma observação. O canal exige um token aleatório mantido apenas pelo consumidor e compara mecanismo, URL/origem, ação, fase, rota, viewport, engine, disposição e identidade com a expectativa canónica; conteúdo atrasado ou uma observação transplantada não pode compartilhar nem fabricar o controlo.
- Toda requisição loopback é validada contra a allowlist de blobs antes de continuar. Caminho desconhecido, ambíguo, ausente, não pinado ou resposta local diferente de 200 cria uma violação operacional e reprova o relatório.
- `preconnect` e `dns-prefetch` externos estáticos são recusados pelo servidor antes de a página ser entregue. A análise estrutural cobre atributos HTML cotados ou não cotados, ordem, espaçamento e capitalização, e falha fechada para sintaxe ambígua. Hints criados dinamicamente são bloqueados e registrados pelo consumidor, independentemente de domínio ou URL; consentimento não converte tentativa bloqueada em PASS.
- Cada contexto começa sem cookies, local/session storage, permissões, Service Workers ou consentimento. Os fluxos responsivos não autorizam consentimento nem submissão; controles separados comprovam que ambos acionariam bloqueio e FAIL.
- Os negativos usam origens `.invalid` locais à prova; nenhum endpoint externo real é necessário ou autorizado.
- O inventário do conteúdo vivo encontrou duas superfícies Meta pré-consentimento na landing CRM: `preconnect` e inserção incondicional de `fbevents.js`. Ambas foram removidas; a página agora cria o script somente após consentimento `granted/v1`, e recusa, ausência ou retirada seguida de recarga produzem zero tentativa externa.

## Estados semânticos aceitos

- `EXPECTED_SEMANTIC_RED`: overflow, touch targets e menu falham pelas causas historicamente contratadas; reduced motion, integridade e rede passam.
- `READY_GREEN`: zero overflow, zero observações com targets inválidos, zero falhas do menu, reduced motion, integridade e rede passam.

Qualquer vetor intermédio, falha genérica, timeout, ação não concluída ou evidência parcial é rejeitado. O head não escolhe o estado.

## Portabilidade e limites

- A identidade dos paths é binária/NUL-delimited e a gramática viva atual permanece ASCII portátil.
- A validação de paths é determinística em Linux e Windows; a execução browser operacional usa a imagem Linux Playwright pinada. Um job browser Windows não é necessário para a mesma imagem OCI e permanece `NOT_APPLICABLE`, não “verificado”.
- O enforcement real só passa a existir na `main` depois de merge protegido e ensaio posterior. Nesta PR, `workflowEnforcement=CANDIDATE_PENDING_PROTECTED_MERGE`.
- O ensaio real posterior contra outra PR permanece `NOT_VERIFIED` nesta missão.
- A instrumentação runtime cobre os mecanismos explicitamente contratados e as tentativas observadas durante 84 observações, 41 identidades e 184 ações por engine. Ofuscação ou fluxos não exercitados podem escapar ao inventário estático; por isso ele nunca é apresentado como prova completa e o ensaio posterior continua necessário.

## Rollback

Conteúdo integrado só poderá ser revertido por nova PR protegida com `git revert -m 1 <merge_sha>`. A proteção remota não é alterada por este pacote.
