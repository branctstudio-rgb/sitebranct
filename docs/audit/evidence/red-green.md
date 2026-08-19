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

## RED 5 — controlo negativo

No head `65ab496ef63957cd2e2626ece5cc248b1c009779`, a captura antiga `home-390x844.jpg` mediu 43,1% uniform/64,4% low-detail e foi incorretamente aceite pelo limiar simples `uniform > 45%`. Após preservá-la como fixture, o gate falhou explicitamente com `negative control was accepted`.

## GREEN 5

O classificador composto usa uniform e low-detail, rejeita as 11 páginas inteiras antigas, aceita somente as duas capturas viewport antigas e exige permanentemente que as 13 imagens atuais sejam aceites e o controlo SHA-fixado seja rejeitado.
