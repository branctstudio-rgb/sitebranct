# Estado vigente e snapshot F2-GOV-02C-F1

O desenho original da superfície transitiva está preservado abaixo como snapshot histórico. O estado vigente é definido por `docs/audit/phase-2/governance/f2-gov-05-current-governance.md`.

<!-- CURRENT_GOVERNANCE_START -->
```json
{
  "status": "CURRENT_OPERATIONAL_GOVERNANCE",
  "effectiveMainSha": "066b85f5c7471b15acba236353c2734098a2cd8a",
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
  "productionAuthorized": false,
  "f201Started": false
}
```
<!-- CURRENT_GOVERNANCE_END -->

Vigente: sentinela e gate universal integram a proteção principal da Via A. A Via B permanece somente como contingência, break-glass humano e rollback.

<!-- HISTORICAL_GOVERNANCE_SNAPSHOT_START -->
# F2-GOV-02C-F1 — superfície transitiva de confiança

Estado: contrato offline; não ativa proteção técnica.

A fonte operacional canónica é `protectedPaths` no workflow base-only `gate-integrity-sentinel.yml`. O inventário foi derivado dos comandos de `universal-pr-gate.yml`, dos imports locais e de cada leitura de contrato, manifesto, fixture e evidência capaz de decidir PASS/FAIL. HTML, CSS, JavaScript e assets vivos são sujeitos da verificação, não autoridades; continuam permitidos pela sentinela.

O conjunto fechado cobre workflows, classificador, construtor do payload, testes executados direta ou transitivamente, scripts de browser/visual, contratos, manifestos, fixtures, documentação normativa, controlo negativo e as 13 evidências. Ele é auto-protegido porque contém a própria sentinela.

A inspeção considera `filename` e `previous_filename`. Alteração, remoção, rename, substituição ou esvaziamento de um membro protegido falham antes de código da PR ser executado. Metadados vazios/malformados, JSON inválido, HTTP diferente de 200, timeout, paginação incompleta ou 3.000 ou mais registos falham fechado.

Não existe exceção automática. Evoluir um componente protegido exige missão humana separada: atualizar a sentinela numa PR dedicada, revisão independente vinculada ao SHA, integrar a nova base e somente depois propor a evolução. Via B continua obrigatória.

Esta correção permanece NÃO ATIVÁVEL como required check até integração na main, observação do run base-only numa PR posterior, repetição dos cenários reais e autorização humana separada.
<!-- HISTORICAL_GOVERNANCE_SNAPSHOT_END -->
