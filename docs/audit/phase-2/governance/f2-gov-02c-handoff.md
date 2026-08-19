# F2-GOV-02C — desacoplamento e sentinela do gate

## Estado

Pacote corretivo offline. Não ativa branch protection, rulesets ou required checks e não autoriza repetição das PRs de ensaio.

## Separação de autoridades

1. F2-00 valida somente o inventário histórico fechado da sua entrega.
2. `classify-pr-paths.mjs` é a autoridade para categorizar caminhos atuais; desconhecidos falham fechado.
3. Browser e visual usam `always()` com a classificação, portanto não são mascarados por falhas anteriores.
4. A sentinela protege o conjunto fechado derivado da árvore transitiva de verificadores, executores, contratos, manifestos, fixtures e evidências capazes de decidir PASS/FAIL. O inventário e o procedimento de evolução estão em `gate-trust-surface.md`.

## Sentinela base-only

`Gate Integrity Sentinel` usa `pull_request_target`. Não faz checkout, não usa Actions, não lê secrets ou tokens, não executa código da PR e tem apenas `contents: read`. Consulta anonimamente a API pública de ficheiros, considera nome atual e anterior de rename e falha fechado para metadados/JSON/HTTP/paginação inválidos ou 3.000 ou mais registos.

Alteração, remoção, rename ou substituição de qualquer membro protegido falha com `protected gate component changed`. Páginas e assets vivos são sujeitos verificáveis, não autoridades protegidas. Documentação e workflows comuns continuam sob o classificador normal.

## Evolução e limites

Não existe bypass automático: evoluir um membro exige PR dedicada da sentinela, revisão humana vinculada ao SHA, integração dessa nova base e missão posterior para o componente. Via B permanece obrigatória.

A primeira integração da sentinela não produz run `pull_request_target` nesta própria PR porque ainda não existe na main. O pacote continua NÃO ATIVÁVEL como required check até integração, observação base-only numa PR posterior, repetição dos cenários reais e autorização humana separada.

Zero FTP, deploy, secrets, produção ou integrações. Rollback de eventual merge: `git revert -m 1 <merge_sha>`.
