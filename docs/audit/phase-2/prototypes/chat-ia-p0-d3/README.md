# Chat IA + Edi — shell P0-D3 local

Protótipo offline para validar o encaixe visual e comportamental do futuro Chat IA no site BRANCT. Não pertence ao manifesto de publicação e não contém endpoint, credencial, integração real, CRM, base de dados ou persistência.

## Execução local

Sirva a raiz do repositório num endereço loopback e abra:

`/docs/audit/phase-2/prototypes/chat-ia-p0-d3/index.html?chat_ia_dev=1`

Sem o parâmetro e sem hostname loopback, a feature flag permanece desligada. O histórico existe apenas no objeto JavaScript da aba. Recarregar a página encerra a sessão.

## Fronteira do adaptador

`mock-adapter.mjs` imita somente o envelope estreito P0-D2 do merge `0e072a778bd6718d23340a5d576669fef78ae73b`: mensagem, histórico, locale e resultados enumerados. Ele não duplica a autoridade do gateway. Consentimento de contacto e rascunho visual de lead ficam fora desse adaptador; nenhum dado de contacto é enviado ao mock de conversa.

O rascunho usa `PROPOSTA_LEAD` e `edi-fronteira-simulada`, sempre com `nenhum_lead_real_criado: true`. Compatibilidade real com Edi, gateway, CRM e produção permanece `NOT_VERIFIED`.
