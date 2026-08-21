# F2-GOV-04 — pacote final de ativação técnica da main

Estado: **offline, não aplicado e não autorizado**. Base vinculativa: `main@5f0af6759ee221869b3fa35fd124a6dd9aa1328b`. A PR #42 integrou o esquema de conta pessoal; o ensaio real #44 recebeu HTTP 200 no PUT, confirmou o round-trip, bloqueou sem revisão, liberou após aprovação externa, descartou a aprovação após novo commit e terminou com rollback HTTP 204/404. Nenhuma branch está protegida hoje.

## Estado atual e alvo

O estado selado atual é: `main.protected=false`, rulesets e required checks vazios, zero branches protegidas e métodos globais `merge=true`, `squash=true`, `rebase=true`. O alvo mantém merge normal, desativa squash/rebase e aplica proteção clássica à `main` com os checks exatos do GitHub Actions (`app_id: 15368`).

O PUT usa somente `strict` e `checks`; `contexts` não é enviado. `restrictions` permanece `null`. Campos organizacionais, dismissal restrictions, bypass allowances e coleções de users/teams/apps são proibidos. Administradores recebem as mesmas regras; há uma aprovação, dismissal stale, last-push approval, conversas resolvidas, force-push/deleção proibidos e histórico linear desligado para preservar merge commits.

## Sequência futura, ainda não autorizada

1. Selar SHA da main, HTTP/status e JSON da proteção, configurações do repositório, rulesets, required checks e hashes.
2. Reconfirmar na mesma main os workflows e identidades exatas dos dois checks; qualquer drift aborta.
3. Após autorização humana separada, aplicar exclusivamente o payload validado.
4. Desativar squash/rebase mantendo merge commit.
5. Fazer GET independente de proteção e repositório e comparar campo a campo.
6. Abrir uma PR documental descartável pós-ativação, sem merge.
7. Provar checks, bloqueio sem revisão, aprovação externa, descarte após novo commit, nova aprovação e elegibilidade final.
8. Fechar a PR sem merge.
9. Somente nova decisão do Conselho pode declarar Via A ativa e retirar Via B.

Os comandos operacionais exatos estão no bloco canónico abaixo. Eles são texto auditável; **não foram executados por esta missão**. `<VALIDATED_BRANCH_PROTECTION_JSON>` deve ser produzido da chave `target.branchProtection` da fixture somente depois de o validador passar no head autorizado.

## Lockout e break-glass

Documentação e testes legítimos continuam classificados e verificáveis. Páginas/assets executam browser e visual antes de falhar pela política; desconhecidos, fixtures inválidas e componentes protegidos falham por causas próprias. Administradores não recebem bypass. O ensaio real provou review obrigatória e stale dismissal.

A evolução de um componente protegido exige cerimónia humana: decisão nomeada vinculada a head/base, snapshot/hash anterior, remoção temporária apenas da exigência da Sentinel, Universal Gate e todas as outras regras retidas, prazo máximo de 60 minutos, restauração e ensaios pós-restauro. Não existe break-glass automático, permanente ou disponível a agentes. Falha em qualquer evidência congela o procedimento e mantém Via B.

## Rollback

O estado selado atual não possui proteção e permite os três métodos. Em lockout, a API administrativa continua fora do caminho de merge: congelar merges, registrar ator/incidente/UTC/head/base, exportar o estado ativo, remover somente a proteção recém-aplicada, exigir DELETE 204 + GET 404, restaurar `merge=true/squash=true/rebase=true`, reconfirmar SHA/rulesets/deployments e manter Via B. Qualquer estado inicial diferente invalida estes comandos e exige um novo pacote.

## Bloco canónico

<!-- F2_GOV_04_PACKAGE_START -->
```json
{
  "baseSha": "5f0af6759ee221869b3fa35fd124a6dd9aa1328b",
  "status": "ACTIVATION_PACKAGE_NOT_APPLIED",
  "target": {
    "branchProtection": {
      "required_status_checks": {
        "strict": true,
        "checks": [
          { "context": "Gate Integrity Sentinel", "app_id": 15368 },
          { "context": "Universal PR Gate", "app_id": 15368 }
        ]
      },
      "enforce_admins": true,
      "required_pull_request_reviews": {
        "dismiss_stale_reviews": true,
        "require_code_owner_reviews": false,
        "required_approving_review_count": 1,
        "require_last_push_approval": true
      },
      "restrictions": null,
      "required_conversation_resolution": true,
      "required_linear_history": false,
      "allow_force_pushes": false,
      "allow_deletions": false,
      "block_creations": false,
      "lock_branch": false,
      "allow_fork_syncing": false
    },
    "repositoryMergeMethods": {
      "allow_merge_commit": true,
      "allow_squash_merge": false,
      "allow_rebase_merge": false
    }
  },
  "activationCommands": {
    "applyProtection": "gh api --method PUT -H \"X-GitHub-Api-Version: 2022-11-28\" repos/branctstudio-rgb/sitebranct/branches/main/protection --input <VALIDATED_BRANCH_PROTECTION_JSON>",
    "restrictMergeMethods": "gh api --method PATCH -H \"X-GitHub-Api-Version: 2022-11-28\" repos/branctstudio-rgb/sitebranct -F allow_merge_commit=true -F allow_squash_merge=false -F allow_rebase_merge=false",
    "readProtection": "gh api -H \"X-GitHub-Api-Version: 2022-11-28\" repos/branctstudio-rgb/sitebranct/branches/main/protection",
    "readRepository": "gh api -H \"X-GitHub-Api-Version: 2022-11-28\" repos/branctstudio-rgb/sitebranct"
  },
  "rollbackCommands": {
    "restoreProtection": "gh api --method DELETE -H \"X-GitHub-Api-Version: 2022-11-28\" repos/branctstudio-rgb/sitebranct/branches/main/protection",
    "restoreMergeMethods": "gh api --method PATCH -H \"X-GitHub-Api-Version: 2022-11-28\" repos/branctstudio-rgb/sitebranct -F allow_merge_commit=true -F allow_squash_merge=true -F allow_rebase_merge=true"
  },
  "viaBRequiredUntilPostActivationApproval": true
}
```
<!-- F2_GOV_04_PACKAGE_END -->

## Texto de autorização futura

`Pessoa: <NAMED_HUMAN>. Decisão: autorizo aplicar o pacote F2-GOV-04 exclusivamente no head <EXACT_PR_HEAD> e base 5f0af6759ee221869b3fa35fd124a6dd9aa1328b, após reconfirmar ausência de drift. Autorizo somente o PUT exato de branch protection na main e o PATCH merge=true/squash=false/rebase=false descritos no pacote. Via B permanece até o ensaio pós-ativação e nova decisão humana. Qualquer mudança de head, base, checks, app_id, payload ou métodos invalida esta autorização.`

O Conselho deve substituir pessoa/head apenas depois do CI e parecer final. Este documento não se autoautoriza.
