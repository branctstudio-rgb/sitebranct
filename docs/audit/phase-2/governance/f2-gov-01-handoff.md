# F2-GOV-01 — handoff para decisão humana

## Resultado

Via A é tecnicamente plausível para um repositório público, mas **não está pronta para ativação completa**. A main continua sem proteção e a proposta não foi aplicada. O bloqueador é a topologia condicional dos dois checks reais; exigir qualquer um agora pode causar lockout legítimo.

## Pacote recomendado

- PR obrigatória; um review distinto; stale dismissal; last-push approval; conversas resolvidas.
- Admins incluídos; push direto, force-push e deleção bloqueados enquanto a regra existir.
- Merge normal preservado; história linear desligada; squash/rebase/auto-merge desautorizados pelo procedimento.
- Required checks vazios até ensaio universal; `contract` e `Verificar escopo do deploy` inventariados e explicitamente diferidos.
- Branch preservada; deploy e workflows intocados.

## Decisão pendente

1. Autorizar missão separada para um gate universal e ensaio em branch descartável; depois decidir ativação da Via A.
2. Corrigir este pacote.
3. Aceitar formalmente a Via B como solução temporária.

Nenhuma opção é escolhida por esta PR.

## RED→GREEN

RED contra o snapshot atual: 0/8 — PR, push, force-push, deleção, checks, stale reviews, conversas e bypass não satisfazem a meta. GREEN valida apenas a proposta offline e seus negativos; não prova configuração ativa.

## Riscos residuais

- Owner admin pode remover a regra.
- Plano concreto da conta é `NOT_VERIFIED` pela API, embora a documentação cubra recursos de repositórios públicos.
- Reviewer distinto e comportamento real não foram ensaiados.
- GitHub Actions indisponível congela merges.
- Nenhum check atual é universal.

## Rollback documental

Fechar a PR draft ou, após eventual merge deste pacote offline, usar `git revert -m 1 <merge_sha>`. Isso não altera regras reais. Rollback de uma futura ativação deve seguir `f2-gov-01-rollout.md`.
