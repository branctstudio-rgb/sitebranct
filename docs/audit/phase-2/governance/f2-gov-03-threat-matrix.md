# F2-GOV-03 — matriz de ameaças

| Ameaça | Falha possível | Prevenção proposta | Evidência exigida | Resposta/rollback |
|---|---|---|---|---|
| Lockout por check ausente ou renomeado | Nenhuma PR pode fundir | Nomes e `app_id` exatos; ensaio descartável antes da `main` | Check iniciado e `success` no head exato | Congelar merges e restaurar payload anterior |
| Check antigo ou de outra fonte | Resultado verde incorreto satisfaz a regra | `strict: true`, app GitHub Actions 15368 e validação do SHA | Observação por API de nome, app, head e conclusão | Remover regra nova e investigar proveniência |
| Administrador contorna processo | Push ou merge sem revisão/check | Recomendação `enforce_admins: true`; decisão explícita do Conselho | Teste de push/merge administrativo bloqueado | Repor Via B e auditar o evento |
| Force-push ou deleção | História ou branch torna-se irrecuperável | `allow_force_pushes: false`, `allow_deletions: false` | Negativos offline e ensaio técnico | Restaurar ref a partir do SHA auditado e congelar merges |
| Bypass amplo/permanente | Controlo vira opcional | Nenhum bypass criado; agentes proibidos; break-glass separado | Export do payload sem allowances | Revogar bypass e repetir ensaios |
| Mudança do próprio gate fica bloqueada | Sentinela reprova corretamente qualquer componente protegido | Cerimónia humana limitada; Universal continua requerido; restauração ≤60 min | Snapshot, aprovação head/base e três ensaios pós-restauro | Restaurar imediatamente o payload e manter Via B |
| Mudança do gate neutraliza verificação | Código hostil passa enquanto sentinela está suspensa | PR dedicada, revisão independente, confiança fechada e ensaios antes/depois | Diff transitivo e resultados pela causa esperada | Reverter merge e restaurar definição anterior |
| Falha/indisponibilidade do Actions | Checks não aparecem ou não terminam | Fail-closed; indisponibilidade normal congela merges | Estado oficial, IDs e timestamps | Remoção temporária só sob critérios objetivos de incidente crítico |
| Merge normal incompatível | Proteção exige história linear | `required_linear_history: false` | PR descartável fundida apenas no ensaio autorizado | Repor payload anterior |
| Aprovação fica obsoleta após push | Conteúdo muda mantendo aprovação antiga | stale reviews + last-push approval | Novo commit invalida aprovação | Bloquear até nova revisão |
| Conversa não resolvida | Achado material é ignorado | resolução obrigatória | Thread aberta impede merge | Resolver ou rejeitar mudança |
| Configuração aplicada ao repo/base errados | Proteção falsa ou mutação indevida | revalidar repo, branch e SHA imediatamente antes | leitura antes/depois e hash do payload | não aplicar; se aplicado, restaurar snapshot |

Nenhum risco desta matriz autoriza produção, deploy ou ativação. Via B permanece obrigatória até o Conselho aprovar e verificar a proteção real.
