# F2-GOV-01 — modelo de ameaça

## Atores e controles

| Ameaça | Via A impede | Risco residual |
|---|---|---|
| Agente/colaborador com write | push direto, force-push, deleção e merge sem PR/review/conversas | pode criar commits maliciosos na branch e tentar manipular CI |
| Aprovador humano | exige nova aprovação após mudança do diff e resolução de conversas | aprovador pode errar, conspirar ou aprovar claims não verificados |
| Administrador/owner | `enforce_admins` impede bypass normal da regra | owner pode editar/remover a própria regra; não há proteção contra o proprietário |
| Credencial comprometida | limita credencial write; admin também é contido enquanto regra existe | credencial admin pode remover proteção; 2FA e rotação ficam fora desta PR |
| Workflow malicioso | review/checks tornam alteração visível antes de merge | um workflow já confiável pode exfiltrar secrets; regras de branch não inspecionam intenção |
| Alteração direta na main | PR obrigatória + admins incluídos bloqueiam | owner pode remover a regra primeiro |
| Aprovação caducada | `dismiss_stale_reviews:true` e last-push approval | depende de configuração realmente ativa e de reviewer distinto |
| CI antigo/SHA diferente | checks estritos devem corresponder ao head mais recente | nomes ambíguos ou fonte errada podem confundir; app source deve ser fixada no ensaio |
| Bypass administrativo | amplo bypass fica proibido no payload | break-glass é alteração humana da regra, auditável mas tecnicamente possível |
| GitHub Actions indisponível | política congela merges | indisponibilidade prolongada pode exigir break-glass humano documentado |

## Limite de confiança

A Via A reduz alterações acidentais e ações de colaboradores/agentes. Não protege o repositório contra o owner `branctstudio-rgb` se esse owner decidir remover regras, nem contra comprometimento total dessa credencial administrativa. Não existe organização/equipa medida que possa separar tecnicamente proprietário, aprovador e break-glass.

O segundo colaborador `felipemartinsal-boop` possui write e pode satisfazer um review distinto, mas a identidade humana e disponibilidade operacional não foram ensaiadas; permanecem `DISPONÍVEL_NÃO_ENSAIADA`.
