# F2-GOV-07 — handoff do contrato multiengine

Estado: pacote offline em desenvolvimento na Issue #58. A F2-01 continua `F2_01_AUTHORIZED_IN_DEVELOPMENT`; nenhuma implementação funcional, configuração remota ou publicação integra este pacote.

## Autoridades e separação de responsabilidades

- `fixtures/audit/f2-01-baseline-results-v3.json`: matriz e predicados semânticos canónicos, conclusão obrigatória e builds das três engines.
- `fixtures/audit/f2-01-transition.json`: caminho, blob, SHA-256, cardinalidades e transições permitidas; preserva v2 como snapshot imutável.
- `fixtures/audit/f2-gov-07-multiengine-fixture.json`: diferenças geométricas sintéticas legítimas usadas apenas nos testes.
- `scripts/governance/verify-f2-01-readiness.mjs`: recalcula predicados, valida bijeções e agrega Chromium/Firefox/WebKit somente quando todos são conclusivos.
- `tests/audit/site-audit.test.mjs`: negativos e positivos permanentes sobre o guardião real.

A aprovação formal permanece exclusiva da Via A no GitHub. O contrato offline prova integridade e elegibilidade técnica; não fabrica aprovação no commit.

## Resultado RED→GREEN

RED reproduzido no código anterior:

1. a baseline v2 não continha `conclusion`;
2. um relatório WebKit semanticamente equivalente era rejeitado apenas por geometria independente (319,8/595 em vez de 320/595,2).

GREEN:

- `conclusion: CONCLUSIVE` obrigatória na v3 e em cada relatório GREEN;
- três engines exatas, 84 observações, 41 menus e 184 ações por engine;
- identidade e cardinalidade exatas, predicados recalculados e evidência bruta validada;
- geometria plausível por engine, sem igualdade byte a byte nem tolerância global;
- capturas obrigatórias com tamanho e SHA-256 calculados/validados pelo consumidor;
- infraestrutura, parcialidade, engine ausente ou identidade divergente falham fechado.

## Limite de migração declarado

Somente o ramo histórico `F2_01_AUTHORIZED_IN_DEVELOPMENT` pode derivar `CONCLUSIVE` para um relatório legado sem esse campo, e apenas depois de `execution.complete=true` e ausência de erros de infraestrutura. Esse caminho serve para preservar o RED histórico já integrado. O ramo GREEN e qualquer promoção exigem o esquema v3 explícito; a exceção não autoriza readiness.

## Superfícies preservadas

Worktrees funcionais, HTML, CSS, JavaScript, assets, workflows, dependências, lockfiles, Sentinel, classificador, deploy e manifesto permanecem fora do diff. A baseline histórica da Fase 1 e a baseline F2-01 v2 permanecem byte-idênticas.

## Riscos e rollback

Risco residual: este pacote valida a semântica e a forma das evidências; a execução real dos três motores e a leitura das capturas dependem do CI pinado já integrado. Qualquer engine não executada é bloqueante.

Antes do merge, rollback é abandonar a branch. Após eventual integração por cerimónia humana, criar uma PR normal que reverta os commits F2-GOV-07 em ordem inversa, preservando Via A e história. Nunca usar push direto, FTP ou produção.
