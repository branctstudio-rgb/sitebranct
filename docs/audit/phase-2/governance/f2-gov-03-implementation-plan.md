# F2-GOV-03 — plano de implementação futura

Este plano **não autoriza a sua própria execução**.

1. Medir novamente proteção, rulesets, permissões, checks, app, SHA e métodos de merge.
2. Obter decisões nominais do Conselho e aprovação vinculada ao payload, head e base.
3. Criar missão de ensaio técnico numa branch descartável; nunca experimentar primeiro na `main`.
4. Aplicar o payload somente ao alvo descartável, recolher leitura antes/depois e executar a matriz completa.
5. Pedir revisão independente e aprovação humana do ensaio.
6. Em missão separada, aplicar à `main`, observar os comportamentos contratados e manter Via B.
7. Só então submeter a retirada da Via B a nova decisão.

Fronteiras: nenhum passo altera páginas, assets, deploy, produção ou integrações. A indisponibilidade de checks, app divergente, base alterada ou capacidade não comprovada termina o procedimento fail-closed.
