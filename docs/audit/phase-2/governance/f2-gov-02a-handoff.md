# F2-GOV-02A — handoff

## RED medido

Na base `d09838956bbf455d728f7e75952cd9ec41498376`, o teste executável terminou 3/4: falhou por `ENOENT` para `.github/workflows/universal-pr-gate.yml`; os workflows de auditoria e deploy provaram `paths`; o snapshot/API confirmou `main` sem proteção e required checks vazios.

## GREEN local medido

O candidato selecionou `audit-contract`, `deploy-protection`, `gate-contract` e `governance-contracts` para o próprio diff, sem deploy. O módulo terminou 49/49, a suíte integrada 94/94 e a proteção de deploy 13/13. A matriz DOM permaneceu 60/60; 13 evidências foram aceites e o controlo negativo foi rejeitado. Os 56 caminhos publicados são todos conhecidos e recebem verificação de browser/visual.

O check candidato deve emitir `Universal PR Gate Candidate / Universal PR Gate` em toda PR. GREEN local não prova emissão remota; somente o CI automático da própria PR pode provar a identidade nesta missão.

## Decisão e prontidão

- Via A: arquitetura-alvo aprovada.
- Via B: obrigatória e ainda efetiva.
- Gate candidato: pronto apenas para revisão offline/CI desta PR.
- F2-GOV-02B: especificada, não autorizada e não criada.
- Ativação de proteção/required checks: bloqueada.
- F2-01: não iniciada.

## Riscos

- O workflow só se torna verdadeiramente universal depois de integrado na `main`; nesta PR ele prova a identidade apenas no próprio delta.
- Um required check configurado antes do ensaio 02B pode causar lockout.
- A política de caminhos fechada exige atualização revisada quando uma nova família legítima aparece.
- GitHub Actions indisponível congela merges sob Via B; não existe bypass automático.
- Merge queue, Firefox, WebKit e Lighthouse continuam `NOT_VERIFIED`.

## Rollback

Antes do merge, fechar a PR draft. Depois de eventual merge autorizado: `git revert -m 1 <merge_sha>`. Como nenhuma proteção real é alterada, esse rollback remove somente workflow, classificador e contratos.
