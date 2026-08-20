# F2-GOV-03 — handoff

Veredicto do pacote: **PROPOSTA_APTA_PARA_DECISAO**, sujeito a CI e revisão defensiva no head final. Não significa proteção ativa ou autorização para aplicá-la.

## Entrega

- Base medida: `3fd31e615a8914aaa1b1d7bcb0a093222eb678ce`.
- Estado medido: branch protection ausente, rulesets inexistentes e required checks vazios.
- Evidência: observação base-only e ensaio real 8/8 pela conclusão e causa contratadas.
- Candidato: proteção clássica com `Gate Integrity Sentinel` e `Universal PR Gate`, vinculados ao GitHub Actions.
- Controlo: fixture operacional, projeção documental idêntica e negativos fail-closed.

## Decisão pendente

O Conselho ainda decide uma ou duas aprovações, identidades dos aprovadores, inclusão de administradores, métodos finais de merge, identidade break-glass, checks exatos e autorização da cerimónia de evolução. Nenhuma dessas decisões é inferida.

## Limites e risco residual

Via B continua obrigatória. A proposta não foi ensaiada como regra ativa, o bypass de ator restrito está `NOT_VERIFIED` e uma indisponibilidade do Actions pode congelar merges. A aplicação futura exige branch descartável, observação na `main`, snapshot/rollback e aprovação humana separada. Zero FTP, deploy, secrets ou produção são autorizados.

Rollback futuro: restaurar o payload anterior sob congelamento de merges e repetir os ensaios. Rollback desta PR documental: `git revert -m 1 <merge_sha>` após eventual merge autorizado, preservando história.
