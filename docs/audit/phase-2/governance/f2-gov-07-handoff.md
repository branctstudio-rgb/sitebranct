# F2-GOV-07 — handoff do contrato multiengine

Estado: pacote offline em desenvolvimento na Issue #58. A F2-01 continua `F2_01_AUTHORIZED_IN_DEVELOPMENT`; nenhuma implementação funcional, configuração remota ou publicação integra este pacote.

## Autoridades e separação de responsabilidades

- `fixtures/audit/f2-01-baseline-results-v3.json`: matriz e predicados semânticos canónicos, conclusão obrigatória e builds das três engines.
- `fixtures/audit/f2-01-transition.json`: caminho, blob, SHA-256, cardinalidades e transições permitidas; preserva v2 como snapshot imutável.
- `fixtures/audit/f2-gov-07-multiengine-fixture.json`: diferenças geométricas sintéticas legítimas usadas apenas nos testes.
- `scripts/governance/verify-f2-01-readiness.mjs`: recalcula predicados, valida bijeções e agrega Chromium/Firefox/WebKit somente quando todos são conclusivos.
- `tests/audit/f2-01-responsive.test.mjs`: produtor protegido que emite conclusão explícita, geometria bruta do drawer e vínculo HMAC por execução.
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
- challenge efémero de 256 bits emitido pelo verificador e vínculo HMAC sobre engine, identidade, tuple, sequência e resultado medido; transplante simples/circular, cópia e recálculo sem chave são recusados;
- limites brutos do drawer recalculados contra a viewport canónica; um booleano `PASS` não mascara geometria fora da viewport;
- geometria plausível por engine, sem igualdade byte a byte nem tolerância global;
- capturas obrigatórias com tamanho e SHA-256 calculados/validados pelo consumidor;
- infraestrutura, parcialidade, engine ausente ou identidade divergente falham fechado.

## Limite de migração declarado

Não existe síntese de conclusão. O produtor protegido deve emitir `CONCLUSIVE` explicitamente após terminar todas as ações, testes semânticos e verificações de infraestrutura. Campo ausente, parcialidade ou erro de infraestrutura falham fechado também no ramo histórico de desenvolvimento. O digest RED histórico continua verificável por uma projeção versionada que exclui apenas os novos campos de proveniência, sem alterar o resultado semântico preservado.

O HMAC impede transplante ou edição posterior do relatório dentro da execução controlada; não pretende tornar confiável um produtor modificado. O produtor, o verificador e o teste integrado pertencem à superfície protegida pela Sentinel. Alterá-los exige cerimónia humana; numa PR funcional comum eles vêm da autoridade integrada em `main`.

## Superfícies preservadas

Worktrees funcionais, HTML, CSS, JavaScript vivo, assets, workflows, dependências, lockfiles, Sentinel, classificador, deploy e manifesto permanecem fora do diff. O produtor offline protegido foi incluído somente para emitir os campos obrigatórios; não muda expectativas funcionais. A baseline histórica da Fase 1 e a baseline F2-01 v2 permanecem byte-idênticas.

## Riscos e rollback

Risco residual: este pacote valida a semântica e a forma das evidências; a execução real dos três motores e a leitura das capturas dependem do CI pinado já integrado. Qualquer engine não executada é bloqueante.

Antes do merge, rollback é abandonar a branch. Após eventual integração por cerimónia humana, criar uma PR normal que reverta os commits F2-GOV-07 em ordem inversa, preservando Via A e história. Nunca usar push direto, FTP ou produção.
