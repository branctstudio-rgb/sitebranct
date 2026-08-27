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
8. O servidor confiável escuta apenas `127.0.0.1`; o contexto Playwright aborta toda origem diferente do loopback corrente.
9. Chromium, Firefox e WebKit executam 84 observações, 41 identidades e 184 ações por engine.
10. O consumidor cria envelopes e digests após medir; relatório parcial, timeout, engine ausente ou inconclusão falham fechado.

## Evolução protegida desta própria PR

Existe um bootstrap transitório fechado somente para a base `3656d57a78b777b1ff279c2cda01905877611117`. Ele permite medir o candidato operacional no CI desta evolução, mas não substitui a Sentinel: o diff precisa ser exatamente o conjunto F2-GOV-09 fechado e a Sentinel permanece deliberadamente vermelha. Após integração, qualquer PR normal usa exclusivamente o bootstrap do seu base SHA; a condição transitória deixa de ser alcançável porque a base muda.

## Rede e credenciais

- Permissão do job: `contents: read`.
- Checkout: `persist-credentials: false`.
- Nenhum secret é referenciado.
- O processo do consumidor recebe ambiente vazio; os browsers recebem somente diretórios temporários locais.
- A prova de isolamento inclui uma tentativa browser real a `https://f2-gov-09.invalid/network-probe`, que deve chegar ao route handler e ser abortada.
- Recursos externos declarados pelas páginas também são abortados; apenas o servidor loopback do ensaio é permitido.

## Estados semânticos aceitos

- `EXPECTED_SEMANTIC_RED`: overflow, touch targets e menu falham pelas causas historicamente contratadas; reduced motion, integridade e rede passam.
- `READY_GREEN`: zero overflow, zero observações com targets inválidos, zero falhas do menu, reduced motion, integridade e rede passam.

Qualquer vetor intermédio, falha genérica, timeout, ação não concluída ou evidência parcial é rejeitado. O head não escolhe o estado.

## Portabilidade e limites

- A identidade dos paths é binária/NUL-delimited e a gramática viva atual permanece ASCII portátil.
- A validação de paths é determinística em Linux e Windows; a execução browser operacional usa a imagem Linux Playwright pinada. Um job browser Windows não é necessário para a mesma imagem OCI e permanece `NOT_APPLICABLE`, não “verificado”.
- O enforcement real só passa a existir na `main` depois de merge protegido e ensaio posterior. Nesta PR, `workflowEnforcement=CANDIDATE_PENDING_PROTECTED_MERGE`.
- O ensaio real posterior contra outra PR permanece `NOT_VERIFIED` nesta missão.

## Rollback

Conteúdo integrado só poderá ser revertido por nova PR protegida com `git revert -m 1 <merge_sha>`. A proteção remota não é alterada por este pacote.
