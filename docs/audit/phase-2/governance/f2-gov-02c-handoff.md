# F2-GOV-02C — desacoplamento e sentinela do gate

## Estado

Pacote corretivo offline. Não ativa branch protection, rulesets ou required checks e não autoriza repetição das PRs de ensaio.

## Separação de autoridades

1. O contrato F2-00 conserva o inventário fechado da sua entrega em `f2-00-contract.json`. Ele valida aqueles dez ficheiros históricos e não lê o diff da PR corrente.
2. `classify-pr-paths.mjs` é a autoridade única para categorizar caminhos atuais. Caminhos conhecidos selecionam suítes; desconhecidos falham fechado.
3. Os contratos de governança validam integridade documental e decisões, sem autorizar ou proibir novos caminhos do repositório.
4. A sentinela protege exclusivamente os componentes que poderiam neutralizar o gate: workflow universal, classificador e a própria sentinela.

## Sentinela base-only

`Gate Integrity Sentinel` usa `pull_request_target`, portanto a definição executada vem da base. Não faz checkout, não usa Actions, não lê `secrets.*` ou `github.token`, não executa código da PR e não possui permissão de escrita. Um Node inline consulta anonimamente apenas a API pública de ficheiros da PR, pagina até ao limite fail-closed de 3.000 registos e compara nomes/renames com o conjunto protegido.

Qualquer alteração a um componente protegido falha com `protected gate component changed`. Um workflow comum continua sob o classificador universal normal. A sentinela não é substituto de revisão humana nem de CODEOWNERS; a Via B permanece obrigatória.

## Verificações live

Browser e evidência visual usam `always()` combinado com a saída do classificador. Assim, continuam a executar mesmo quando deploy-protection falha antes. A decisão terminal preserva a falha original.

## Resultados contratados para futura repetição

- Documentação, testes e workflow comum: SUCCESS.
- Página e asset novos: FAILURE após deploy-protection, browser e visual; nunca pela allowlist F2-00.
- Desconhecido: FAILURE no classificador.
- Fixture inválida: FAILURE pela adulteração específica.
- Componente protegido: FAILURE na sentinela.

## Limites e risco residual

A API pública pode sofrer indisponibilidade ou rate limit; a sentinela falha fechado. PRs com mais de 3.000 registos falham fechado. A primeira integração da própria sentinela não consegue produzir um run `pull_request_target` a partir da PR, pois o workflow ainda não existe na main; os negativos offline cobrem essa transição, e um ensaio real posterior continua necessário antes de ativar required checks.

Zero FTP, deploy, secrets, produção ou integrações. Rollback de eventual merge: `git revert -m 1 <merge_sha>`.
