# Decisão de governança da Fase 2

Status: **PENDING_HUMAN_DECISION**. Este pacote apresenta duas vias; o Conselho não escolhe automaticamente nenhuma delas nesta missão.

## Evidência atual

Em 2026-08-19, a API do GitHub respondeu `Branch not protected (HTTP 404)` para `main`. Portanto, a `main` **não possui proteção técnica de branch**. A proteção de escopo do deploy existe e impede que documentação/testes offline iniciem FTP, mas não impede push direto nem substitui branch protection.

Plano da conta, permissões administrativas e disponibilidade de rulesets não foram alterados nesta missão. A capacidade de ativar todas as regras abaixo é `NOT_VERIFIED` até um administrador confirmar plano e permissões.

## Via A — proteção técnica real

Objetivo: fazer o GitHub rejeitar integrações que não satisfaçam controles técnicos.

Pacote proposto para decisão humana, se plano/permissões permitirem:

1. Proibir push direto e force-push em `main`, incluindo administradores salvo break-glass auditável.
2. Exigir pull request antes de merge.
3. Exigir checks nomeados e atuais no head exato; os checks concretos dependem do tipo de mudança.
4. Exigir pelo menos uma revisão independente e invalidar aprovação após novos commits.
5. Exigir resolução explícita de conversas materiais, sem auto-resolve por agente.
6. Bloquear deleção da branch e exigir histórico linear **somente se** isso não conflitar com a decisão já aprovada de merge normal. Como o processo atual exige merge commits, “linear history” fica desmarcado no pacote recomendado.
7. Restringir bypass a um grupo humano mínimo, com runbook e registo.
8. Preservar a proteção positiva de deploy e `workflow_dispatch` restrito à `main`.

Antes de aplicar: capturar configuração atual, confirmar impacto em automações, testar numa branch de ensaio e aprovar rollback. Esta documentação não concede permissão administrativa nem aplica ruleset.

## Via B — controlo processual compensatório

Limite técnico: a Via B reduz risco de alteração não revista, mas não substitui proteção de branch e não impede o FTP quando um merge em `main` contém caminhos vivos. “Produção bloqueada por defeito” significa que missões offline não podem fundir esses caminhos; antes de uma futura F2-01, preview/staging ou suspensão controlada do deploy exige decisão técnica e autorização separada. O processo não deve prometer ausência de deploy após merge de HTML/CSS/JS.

Enquanto a proteção técnica não existir, todas as mudanças seguem obrigatoriamente:

1. PR sempre em draft durante execução.
2. Branch e worktree isoladas a partir da base humana autorizada.
3. Nenhum push direto para `main`; push usa ref explícita da branch.
4. CI verde no head exato.
5. Revisão independente com veredicto literal e achados rastreáveis.
6. Aprovação humana vinculada ao head e à base completos.
7. Qualquer mudança de head ou base invalida a aprovação e exige novo CI/revisão.
8. Merge normal apenas; sem squash, rebase ou force-push.
9. Branch preservada após merge.
10. Confirmação pós-merge do SHA, pais, testes e ausência de efeitos operacionais não autorizados.
11. Rollback documentado com `git revert`, preservando história.
12. Proteção de deploy mantida e testada; manifesto/payload permanecem fail-closed.
13. Produção bloqueada por defeito; FTP, `workflow_dispatch`, secrets e integrações exigem autorização humana separada e explícita.

Via B reduz risco, mas **não equivale** a proteção técnica: um utilizador com write ainda pode empurrar diretamente para `main`. A compensação depende de disciplina, revisão e evidência.

## Matriz de decisão

| Critério | Via A | Via B |
|---|---|---|
| Enforcement | GitHub rejeita violações configuradas | Pessoas/processo detetam e bloqueiam |
| Dependência | Plano/permissão administrativa | Disciplina e revisão contínuas |
| Push direto | Tecnicamente bloqueável | Proibido por norma, ainda tecnicamente possível |
| Aprovação obsoleta | Pode ser automaticamente invalidada | Deve ser reconfirmada manualmente |
| Custo de adoção | Configuração, ensaio e manutenção | Operação mais lenta e risco humano residual |
| Rollback | Restaurar ruleset/configuração capturada | Reverter merge; reforçar procedimento |

## Pergunta para o gate humano

Escolher explicitamente uma opção:

- **A:** autorizar missão administrativa separada para validar plano/permissões, propor ruleset exato, ensaiar e ativar proteção técnica; ou
- **B:** aceitar formalmente o risco residual e tornar o processo compensatório vinculativo até nova decisão.

Sem escolha, o estado permanece `PENDING_HUMAN_DECISION` e a Via B continua sendo o mínimo operacional, não uma alegação de segurança técnica.

## Rollback da governança documental

Fechar a PR F2-00 sem merge. Se integrada, reverter apenas o merge documental. Uma futura Via A terá rollback próprio de configuração; esta missão não toca configurações GitHub.
