# F2-GOV-03 — plano de ativação proposto

Estado: desenho offline. Não executar sem missão e autorização humanas separadas.

## Gate prévio

Revalidar `main`, capacidades da conta, regras/rulesets existentes, nomes e fontes dos checks, métodos de merge e snapshot completo. O Conselho deve decidir aprovações, identidades, aplicação a administradores, métodos de merge, break-glass e cerimónia de evolução. Qualquer diferença invalida a autorização.

## Etapa 1 — branch descartável

Aplicar a proposta somente numa branch descartável criada para o ensaio. Repetir documentação, teste, página, asset, workflow comum, caminho desconhecido, identidade inválida e componente protegido. Verificar checks no head exato, bloqueios, merge normal compatível e zero efeitos externos. Remover a branch/regra de ensaio segundo autorização específica. Um resultado correto pela causa errada reprova.

## Etapa 2 — main

Somente após aprovação do relatório da Etapa 1, aplicar o payload aprovado à `main`. Observar uma PR documental benigna, invalidação de aprovação por novo commit, conversa pendente, push direto bloqueado, merge normal e congelamento de autoalteração sem cerimónia. Exportar o payload observado e compará-lo ao aprovado. Via B só pode ser retirada por nova decisão humana.

## Evolução protegida

A opção recomendada permite retirar `Gate Integrity Sentinel` temporariamente dos required checks, nunca desativá-la nem alterar o workflow. Exige aprovação head/base, snapshot, PR dedicada, Universal PR Gate ainda requerido, revisão independente, restauração em até 60 minutos e ensaios pós-restauro. A alternativa de ator restrito permanece `NOT_VERIFIED`.

## Remoção temporária objetiva

Só considerar diante de incidente crítico documentado, regra exata identificada, aprovação humana nomeada, snapshot e hash, suspensão mínima, prazo ≤60 minutos, responsável por restauração e ensaios posteriores. Uma interrupção ordinária do Actions apenas congela merges; não cria bypass automático.

## Rollback

Ao primeiro lockout, fonte inesperada, incompatibilidade, falso positivo ou falha de observação: congelar merges; exportar estado; restaurar o payload imediatamente anterior; registrar ator, UTC, head e base; repetir os ensaios documental, inválido e protegido. Na primeira ativação, o estado anterior é ausência de proteção, mas a remoção ainda requer prova e autorização de incidente.
