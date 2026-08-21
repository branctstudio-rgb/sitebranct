# F2-GOV-04 — handoff ao Conselho

Pacote exclusivamente offline na Issue #45. Base: `5f0af6759ee221869b3fa35fd124a6dd9aa1328b`. F2-GOV-03-F1 está integrada e o ensaio real #44 terminou **ATIVÁVEL**, fechado sem merge e com proteção descartável removida.

## Decisão preparada

- Proteção clássica exata com Sentinel + Universal, `app_id: 15368`, revisão externa, stale/last-push, conversas, admins, sem bypass, force-push ou deleção.
- Merge commit permitido; squash e rebase desativados; histórico linear desligado.
- Ativação, métodos e ensaio pós-ativação permanecem sem autorização nesta PR.
- Via B permanece obrigatória até prova pós-ativação e nova decisão humana.

## Evidência e limites

O contrato simula caminhos legítimos e falhas por causa própria e vincula o round-trip real da PR #44. A proteção contra direct push/force-push/deleção é fechada no payload e round-trip; tentativas destrutivas na main não são autorizadas. Indisponibilidade do Actions congela merges. Evolução da trust surface exige a cerimónia humana limitada documentada; nenhum bypass automático foi criado.

Rollback desta PR após eventual merge: `git revert -m 1 <merge_sha>`. Rollback futuro da configuração restaura exatamente o snapshot selado e mantém Via B. Zero FTP, workflow_dispatch, deployment, secret, produção ou F2-01.
