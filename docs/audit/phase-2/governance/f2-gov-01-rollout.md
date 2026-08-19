# F2-GOV-01 — rollout e anti-lockout

Status: plano não autorizado. Não criar branch de ensaio nesta missão.

## Decisão técnica

A configuração final completa não está pronta para ativação: nenhum check real executa em todos os PRs. Ativar `contract` bloquearia PRs apenas vivas; ativar `Verificar escopo do deploy` bloquearia PRs apenas documentais. A Via B permanece necessária até autorização separada para desenhar um check universal ou provar outra topologia.

## Ensaio obrigatório futuro

1. Criar branch descartável `gov-trial/main-protection-<data>` somente após autorização humana.
2. Exportar a configuração anterior e aplicar o payload à branch de ensaio, nunca à main primeiro.
3. Abrir PR exclusivamente documental e registrar checks no head exato.
4. Abrir PR que altera fixture sintética representando caminho vivo, sem publicar, e registrar checks.
5. Confirmar que novo commit invalida aprovação; conversa material não resolvida bloqueia.
6. Ensaiar tentativas não destrutivas de push direto. Force-push/deleção usam branch descartável e exigem autorização específica.
7. Reverter a regra de ensaio e provar restauração.

O ensaio só passa se cada check proposto nascer nos dois PRs, vier de `github-actions`, estiver associado ao SHA atual e não acessar secrets/deploy.

## GitHub Actions indisponível

Não fazer bypass automático. Congelar merges e registrar incidente. Break-glass só por owner humano para incidente crítico, com justificativa, head/base, snapshot antes/depois e prazo de restauração de 60 minutos. Depois, repetir ambos os PRs de ensaio e obter revisão independente.

## Break-glass

O único break-glass tecnicamente medido é o owner administrativo `branctstudio-rgb`, que pode editar/remover a regra. Agentes nunca recebem bypass. Após uso, registrar ator, UTC, motivo, PR/SHA, campos alterados e resultado da restauração. A possibilidade de remoção pelo owner é risco, não garantia de segurança.

## Compatibilidade com merge normal

`required_linear_history:false`; merge commit permanece o único método autorizado pelo procedimento. Squash e rebase podem continuar visíveis na interface, mas não são autorizados. Branch é preservada após merge. Auto-merge permanece desautorizado.

## Rollback

Usar o snapshot exportado antes da ativação. Remover apenas o campo bloqueante ou restaurar integralmente o payload anterior; não improvisar uma allowlist ampla. Revalidar os dois cenários de PR e a revisão caducada antes de reativar.
