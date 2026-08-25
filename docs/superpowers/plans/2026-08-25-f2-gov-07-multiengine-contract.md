# F2-GOV-07 — contrato multiengine canônico da F2-01

Issue-lock: #58  
Branch: `agent/f2-gov-07-multiengine-contract`  
Base/HEAD inicial: `1f7e95315e518a4ea0a5f1668db67e5b18a69087`

## Invariantes selados

- Via A ativa: `Universal PR Gate` e `Gate Integrity Sentinel`, strict, `app_id: 15368`.
- Merge normal permitido; squash e rebase desativados.
- Rulesets: zero. Deployments: zero. PRs concorrentes: zero.
- `redesign-light-2026`: `310a4de3ff15a4abc57ea31f668c2deee48443bb`, somente leitura.
- Worktree histórica: branch `agent/f2-01-responsive-header`, head `a47abb9a43248320dfef8449b6a65e187913fd24`, diff `1525f75f0f9636eb1110c2dcde0ad886e554b0cc`, teste `27e053d8c0de7569215cc41323e0827d5746f81e`.
- Worktree funcional: branch `agent/f2-01-functional-final`, head `1f7e95315e518a4ea0a5f1668db67e5b18a69087`; cinco caminhos funcionais modificados e somente leitura.

## Conjunto fechado antes da primeira edição de contrato

1. `fixtures/audit/f2-01-baseline-results-v3.json`
2. `fixtures/audit/f2-gov-07-multiengine-fixture.json`
3. `fixtures/audit/f2-01-transition.json`
4. `scripts/governance/verify-f2-01-readiness.mjs`
5. `tests/audit/site-audit.test.mjs`
6. `docs/audit/phase-2/f2-01-specification.md`
7. `docs/audit/phase-2/f2-01-implementation-plan.md`
8. `docs/audit/phase-2/governance/f2-gov-07-handoff.md`
9. `docs/superpowers/plans/2026-08-25-f2-gov-07-multiengine-contract.md`

Dependência: a v3 nova contém somente autoridade semântica e esquema. A transição protegida fixa caminho, schema, digest, matriz e origem. O verificador consome essa autoridade e recalcula predicados a partir de evidência bruta; o teste integrado exercita o guardião real. Especificação, plano e handoff descrevem a migração e os limites sem promover F2-01.

Exclusões deliberadas: baseline F2-01 v2 e baseline histórica permanecem byte-idênticas; workflows, dependências, lockfiles, Sentinel, classificador, deploy, manifesto e ficheiros vivos não mudam.

## Modelo A/B/C/D

- A — identidade exata: engine/build, rota, viewport, observação, menu, ação, sequência, cardinalidades e vínculos vêm das autoridades independentes.
- B — predicados recalculados: overflow, 44×44, operação do menu, foco, inert, scroll lock, reduced-motion, conclusão de ações e infraestrutura.
- C — geometria observacional: obrigatória, numérica, finita, não negativa e internamente coerente; pode variar por engine e não é comparada byte a byte.
- D — metadados não autoritativos: forma/sanitização apenas; nunca autorizam GREEN.

## Ciclos RED→GREEN

1. Adicionar testes que provem ausência de conclusão e rejeição indevida de geometria legítima no código atual; executar contra o guardião real e guardar a causa.
2. Introduzir baseline v3 e fixture sintética; o teste continua RED até o verificador consumir a v3.
3. Implementar validação individual por engine e agregação exata das três engines, sempre com `conclusion: CONCLUSIVE`.
4. Implementar comparação semântica: identidades exatas, predicados recalculados, geometria plausível e metadados não autoritativos.
5. Ancorar v3 na transição sem promover `F2_01_AUTHORIZED_IN_DEVELOPMENT`.
6. Adicionar os 40 negativos e 12 positivos exigidos; cada mutação deve provar que não foi vazia e falhar pela etiqueta prevista.
7. Executar LF e CRLF, regressões totais, CI e revisão adversarial em quatro lentes.

## Critérios de paragem

- Qualquer necessidade de tocar workflow, dependência, lockfile, Sentinel, HTML/CSS/JS/asset, deploy ou manifesto resulta em `BLOCKED_BEFORE_SCOPE_EXPANSION`.
- Qualquer divergência inesperada nas worktrees preservadas interrompe a missão.
- Nenhum PUT, alteração de proteção, merge, FTP, secret, deployment ou produção.

## Rollback

Antes do merge: abandonar a branch. Depois de eventual cerimónia e integração humanas: nova PR normal revertendo os commits F2-GOV-07 em ordem inversa, preservando história e Via A.
