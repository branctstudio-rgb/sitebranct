# Estado operacional de governança — F2-GOV-05

Este é o registo canónico do estado vigente após o encerramento autorizado da F2-GOV-04. Ele substitui somente a interpretação operacional de propostas e handoffs anteriores; não apaga a história nem lhes atribui efeitos retroativos.

<!-- CURRENT_GOVERNANCE_START -->
```json
{
  "schemaVersion": 1,
  "status": "CURRENT_OPERATIONAL_GOVERNANCE",
  "repository": "branctstudio-rgb/sitebranct",
  "effectiveMainSha": "066b85f5c7471b15acba236353c2734098a2cd8a",
  "evidence": {
    "closureIssue": 45,
    "activationTrialPr": 47,
    "authorizationComment": 5367099909,
    "sentinelRun": 32460975260,
    "universalRun": 32460977218,
    "offlineAuditRun": 32460977337
  },
  "current": {
    "viaA": "PRIMARY_ACTIVE",
    "viaB": "CONTINGENCY_BREAK_GLASS_ROLLBACK",
    "viaBRequired": false,
    "mainProtected": true,
    "requiredChecks": [
      { "context": "Gate Integrity Sentinel", "appId": 15368 },
      { "context": "Universal PR Gate", "appId": 15368 }
    ],
    "mergeMethods": { "merge": true, "squash": false, "rebase": false }
  },
  "historyPolicy": {
    "preserveSnapshots": true,
    "historicalClaimsCannotOverrideCurrent": true
  },
  "productionAuthorized": false,
  "f201Started": false
}
```
<!-- CURRENT_GOVERNANCE_END -->

## Interpretação vinculativa

- `VIA_A = PROTEÇÃO PRINCIPAL ATIVA`.
- `VIA_B = CONTINGÊNCIA / BREAK-GLASS / ROLLBACK`.
- `VIA_B_OBRIGATÓRIA = NÃO`.
- Break-glass depende de decisão humana explícita e trilha auditável; este documento não cria bypass.
- Planos, handoffs e snapshots anteriores continuam válidos como história, mas não prevalecem como estado atual quando conflitarem com este registo.
- Este pacote é exclusivamente documental e offline: não altera proteção remota, não autoriza produção e não inicia a F2-01.

## Rollback

O estado remoto deve ser confirmado pela API antes de qualquer operação administrativa. O rollback deste registo é `git revert -m 1 <merge_sha>` e não deve alterar a proteção técnica existente.
