# Registo RED→GREEN

Este registo torna verificável a sequência executada localmente, sem afirmar separação artificial de commits.

## RED 1 — contrato ausente

`node --test tests/audit/site-audit.test.mjs` falhou com `ENOENT` para `fixtures/audit/site-contract.json`. Após criar o contrato, 1/1 teste passou.

## RED 2 — handoff ausente

O mesmo comando falhou com `ENOENT` para `docs/audit/phase-1-audit.md`. Após adicionar o conjunto documental, 2/2 testes passaram.

## RED 3 — prova adversarial

Em 2026-08-18, o teste reforçado falhou 2/4 casos com `ENOENT` para `fixtures/audit/baseline-results.json` e `docs/audit/evidence/red-green.md`. A falha expôs que o contrato anterior apenas validava declarações autocertificadas.

## GREEN

Critério inicial: 4/4 testes passam após validar o diff, a matriz de 12 rotas × 5 viewports, a existência/dimensão/hash das 13 imagens e o workflow fixado por SHA.

## RED 4 — validade visual e workflow durável

Após o parecer `CHANGES_REQUIRED` no comentário #5332433500, `node tests/audit/check-visual-evidence.mjs` rejeitou 11/13 capturas: entre 43,1% e 57,5% das bandas eram uniformes nos artefactos afetados. Em paralelo, `node --test tests/audit/site-audit.test.mjs` falhou porque o workflow continha `github.head_ref == 'agent/phase-1-offline-audit'` e não executava o novo gate de pixels.

## GREEN 4

Critério: capturas regeneradas após scroll/estabilização, inspeção visual real desktop/tablet/mobile, gate de pixels sem falhas, conjunto manifesto/diretório exato, 4/4 testes, matriz DOM 60/60 e workflow durável por paths relevantes e base dinâmica do PR. O output final do CI do PR é a autoridade remota; este documento é evidência de processo, não substituto do teste.
