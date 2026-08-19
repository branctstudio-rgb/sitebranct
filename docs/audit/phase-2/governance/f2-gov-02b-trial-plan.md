# F2-GOV-02B — plano do ensaio descartável, não autorizado

Estado: `CONTRACT_ONLY_NOT_AUTHORIZED`. Nenhuma branch ou PR deste plano existe.

## Precondições futuras

1. O gate universal deve estar integrado na `main` e emitir `Universal PR Gate`.
2. `main` deve continuar sem required checks durante o ensaio.
3. Uma nova Issue-lock deve reservar branches `gov-trial/02b-*` e confirmar produção bloqueada.
4. A autorização deve nomear os SHAs, os sete cenários e a limpeza.

## Cenários

O contrato estruturado `fixtures/audit/f2-gov-02b-trial-contract.json` define PR documental, de testes, de página viva, de asset, de workflow, de caminho desconhecido e deliberadamente inválida. Cada PR deve provar que o mesmo check aparece no head mais recente. Cenários vivos são desenhados para falhar contra a baseline sem atualizar evidência; não podem ser fundidos.

## Evidência exigida

- URL, branch, base, head, evento, nome/app do check, início, conclusão e duração;
- lista exata de workflows e deployments por SHA;
- zero acesso a secrets, FTP, produção ou `workflow_dispatch`;
- resultado coerente com o contrato e repetição após novo commit;
- captura do estado de required checks antes e depois, que deve permanecer vazio.

## Limpeza fail-closed

Todas as PRs permanecem draft, são fechadas sem merge e têm branches descartáveis removidas somente após inventário e confirmação de que nenhum ficheiro alcançou `main`. Falha de limpeza, check ausente ou nome divergente bloqueia a recomendação de ativação. Evidências redigidas permanecem na Issue; fixtures reais não permanecem no repositório.

## Gate posterior

O sucesso da F2-GOV-02B permite apenas preparar uma nova decisão. Não ativa automaticamente branch protection ou required checks.
