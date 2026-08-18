# Registo RED→GREEN

Este registo torna verificável a sequência executada localmente, sem afirmar separação artificial de commits.

## RED 1 — contrato ausente

`node --test tests/audit/site-audit.test.mjs` falhou com `ENOENT` para `fixtures/audit/site-contract.json`. Após criar o contrato, 1/1 teste passou.

## RED 2 — handoff ausente

O mesmo comando falhou com `ENOENT` para `docs/audit/phase-1-audit.md`. Após adicionar o conjunto documental, 2/2 testes passaram.

## RED 3 — prova adversarial

Em 2026-08-18, o teste reforçado falhou 2/4 casos com `ENOENT` para `fixtures/audit/baseline-results.json` e `docs/audit/evidence/red-green.md`. A falha expôs que o contrato anterior apenas validava declarações autocertificadas.

## GREEN

Critério: 4/4 testes passam após validar o diff contra a base, a matriz de 12 rotas × 3 viewports, a existência/dimensão/hash das 13 imagens e o workflow fixado por SHA. O output final do CI do PR é a autoridade remota; este documento é evidência de processo, não substituto do teste.
