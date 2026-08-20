# F2-GOV-03 — proposta offline de proteção da `main`

Estado: **PROPOSTA NÃO APLICADA**. Este documento não ativa proteção, ruleset, required check, bypass, merge queue, deploy ou produção.

## Evidência e objetivo

A medição está vinculada a `main@3fd31e615a8914aaa1b1d7bcb0a093222eb678ce`. Nesse estado, a `main` não possui proteção técnica, rulesets ou required checks. A observação base-only da sentinela passou na PR #28 e o ensaio F2-GOV-02E correspondeu à conclusão e à causa esperadas em 8/8 PRs descartáveis (#30–#37), todas fechadas sem merge. Isso torna o pacote elegível para decisão, não para ativação automática.

A proposta usa proteção clássica de branch porque o endpoint correspondente foi medido e o payload pode vincular cada check ao GitHub Actions pelo `app_id`. A aplicação futura deve seguir a documentação oficial da [Branch protection API](https://docs.github.com/en/rest/branches/branch-protection) e as [regras de branches protegidas](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), sempre numa missão separada.

A compatibilidade do pedido foi corrigida offline após os dois HTTP 422 da Issue #40, medidos em `main@32e63a416793a2ba0ca917d71ec652cc6bc22deb`. Para o repositório pertencente a uma conta pessoal, o pedido usa a API `2022-11-28`, envia `required_status_checks` somente com `strict` e `checks`, e omite `dismissal_restrictions` e `bypass_pull_request_allowances`. A omissão não concede bypass: significa que nenhuma coleção de utilizadores, equipas ou aplicações é enviada. `restrictions: null` permanece como campo de topo exigido pelo endpoint.

## Decisão recomendada, ainda pendente

- Exigir PR e os checks exatos `Gate Integrity Sentinel` e `Universal PR Gate`, ambos provenientes de `github-actions` (`app_id: 15368`) e concluídos com sucesso no head mais recente.
- Exigir base atualizada, resolução das conversas, descarte de aprovações obsoletas e aprovação do último push.
- Recomendar uma aprovação humana; o Conselho decide entre uma ou duas e define identidades elegíveis.
- Aplicar as regras a administradores; esta escolha continua expressamente pendente do Conselho.
- Bloquear push direto, force-push, deleção e bypass amplo, permanente, de agente ou silencioso.
- Manter merge normal como método recomendado e história não linear. Squash e rebase são capacidades atuais, mas sua permanência é decisão humana.
- Manter a Via B até ativação, ensaio e aprovação pós-ativação concluídos.

## Evolução dos próprios gates

Há duas vias documentadas. A recomendada remove temporariamente **somente** a exigência da sentinela, mantém o Universal PR Gate e as demais regras, exige aprovação humana vinculada a head/base, snapshot do payload, restauração em até 60 minutos e novos ensaios. A alternativa é um bypass temporário de ator humano restrito; ela permanece `NOT_VERIFIED` até que identidade, capacidade, expiração, auditoria e revogação sejam provadas. Nenhuma exceção é criada por esta proposta.

## Contrato canónico

O bloco seguinte é uma projeção estrutural do manifesto operacional. O teste compara nomes, valores e decisões campo a campo.

<!-- F2_GOV_03_CANONICAL_START -->
```json
{
  "schemaVersion": 1,
  "repository": "branctstudio-rgb/sitebranct",
  "status": "PROPOSAL_NOT_APPLIED",
  "measurementBase": "3fd31e615a8914aaa1b1d7bcb0a093222eb678ce",
  "target": {
    "branch": "main",
    "mechanism": "classic_branch_protection",
    "requiredChecks": [
      {
        "name": "Gate Integrity Sentinel",
        "workflow": "Gate Integrity Sentinel",
        "event": "pull_request_target",
        "appId": 15368,
        "appSlug": "github-actions"
      },
      {
        "name": "Universal PR Gate",
        "workflow": "Universal PR Gate Candidate",
        "event": "pull_request",
        "appId": 15368,
        "appSlug": "github-actions"
      }
    ],
    "rules": {
      "requirePullRequest": true,
      "recommendedApprovals": 1,
      "dismissStaleApprovals": true,
      "requireLastPushApproval": true,
      "requireConversationResolution": true,
      "blockDirectPush": true,
      "blockForcePush": true,
      "blockDeletion": true,
      "includeAdministrators": true,
      "requireLinearHistory": false,
      "checksMustStartOnLatestHead": true,
      "acceptedRequiredCheckConclusion": "success_only_by_activation_verifier"
    },
    "bypass": {
      "broad": false,
      "permanent": false,
      "createdByThisProposal": false,
      "agentsAllowed": false,
      "breakGlassRequiresSeparateHumanDecision": true
    },
    "mergePolicy": {
      "recommendedMethods": [
        "merge_commit"
      ],
      "squashCurrentRepositoryCapability": true,
      "rebaseCurrentRepositoryCapability": true,
      "finalMethodsRequireCouncilDecision": true,
      "preserveBranch": true
    },
    "apiCompatibility": {
      "ownerType": "User",
      "apiVersion": "2022-11-28",
      "measuredAtBase": "32e63a416793a2ba0ca917d71ec652cc6bc22deb",
      "evidenceIssue": 40,
      "incompatibleRequestFields": [
        "required_status_checks.contexts with app-bound checks",
        "required_pull_request_reviews.dismissal_restrictions",
        "required_pull_request_reviews.bypass_pull_request_allowances"
      ],
      "omissionSemantics": "No user, team, app or bypass allowance is granted; omitted organization-only fields are absent permissions."
    },
    "apiPayload": {
      "required_status_checks": {
        "strict": true,
        "checks": [
          {
            "context": "Gate Integrity Sentinel",
            "app_id": 15368
          },
          {
            "context": "Universal PR Gate",
            "app_id": 15368
          }
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
    }
  },
  "gateEvolution": {
    "required": true,
    "recommendedOption": "temporary-sentinel-requirement-ceremony",
    "optionIds": [
      "temporary-sentinel-requirement-ceremony",
      "restricted-actor-time-boxed-bypass"
    ]
  },
  "activation": {
    "authorized": false,
    "stageOneRequired": true,
    "stageTwoRequired": true
  },
  "rollbackTrigger": "lockout, missing or stale check, unexpected app source, merge incompatibility, false positive, unbounded ceremony or failed post-activation observation",
  "pendingCouncilDecisions": [
    "administrators-subject-to-rules",
    "approver-identities",
    "break-glass-actor",
    "gate-evolution-authorization",
    "merge-methods",
    "one-or-two-approvals",
    "required-check-identities"
  ]
}
```
<!-- F2_GOV_03_CANONICAL_END -->

## Limite vinculativo

O payload acima é candidato, não instrução de execução. Qualquer mudança da base, do tipo de proprietário, da versão da API, dos checks, da fonte do app, das decisões humanas ou da capacidade da conta invalida a evidência e exige nova medição, novo CI e nova aprovação. O próximo passo possível é um novo ensaio descartável com autorização própria; esta correção não o executa.
