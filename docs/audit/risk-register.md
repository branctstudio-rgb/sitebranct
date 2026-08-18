# Matriz de riscos e rollback

| Risco | Prob. | Impacto | Estado | Mitigação |
|---|---:|---:|---|---|
| Push acidental para `main` publica FTP | Média | Crítico | Aberto | Confirmar branch antes de push; push com ref explícita; proteger `main` em missão humana |
| Colisão com trabalho paralelo | Baixa | Alto | Monitorizado | Base fixa; ficheiros novos; parar se `main` avançar ou houver interseção |
| Documentação induzir decisão errada | Alta | Médio | Tratado | Marcar factos obsoletos e separar observado/documentado/futuro |
| Overflow mobile prejudicar navegação | Alta | Alto | Aberto | Missão de correção isolada com screenshots e teste de `scrollWidth` |
| SEO internacional duplicado | Alta | Alto | Aberto | URLs por locale + hreflang recíproco antes de indexar idiomas |
| Prometer produto futuro como ativo | Média | Alto | Aberto | Campo de estado e revisão de produto/compliance |
| Métricas históricas tratadas como atuais | Média | Médio | Tratado | Trace marcado bloqueado; nenhuma pontuação atual inventada |
| Dados reais em demos | Baixa | Crítico | Bloqueado | Fixtures sintéticas e revisão visual/redaction |
| Integração viva acionada em teste | Baixa | Crítico | Bloqueado | Não submeter forms; testes offline; sem secrets |

## Rollback desta entrega

- Fechar a PR sem merge.
- Remover a branch remota após decisão humana.
- Descartar a worktree local.
- Se a branch vier a ser integrada e precisar de reversão, reverter somente o commit documental/CI da auditoria.
- Não há rollback de produção: nenhuma produção foi alterada.

## Gatilhos de paragem

- `origin/main` diferente de `da8800cd7669f66a82cbf9cd2e4f22fa99d59320` antes do push.
- Nova Issue/PR com interseção em `docs/audit/**`, `tests/audit/**`, `fixtures/audit/**` ou `.github/workflows/audit-offline.yml`.
- Qualquer pedido de secret, dado real, submissão de form, integração ou deploy.
- Achado Critical/Important da revisão adversarial sem tratamento ou registo explícito.
