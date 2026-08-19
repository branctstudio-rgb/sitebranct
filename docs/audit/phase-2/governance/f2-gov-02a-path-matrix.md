# F2-GOV-02A — matriz de caminhos

A fonte executável é `fixtures/audit/f2-gov-02a-path-matrix.json`. A tabela resume o resultado esperado; `deploy` é sempre `false`.

| Cenário | Categoria | Suítes adicionais | Resultado |
|---|---|---|---|
| documentação, testes, fixtures de auditoria | offline auditável | audit-contract | aceitar |
| HTML, CSS, JavaScript | vivo | browser-baseline + visual-evidence | aceitar e verificar |
| fontes, traduções, imagens, vídeo | vivo | browser-baseline + visual-evidence | aceitar e verificar |
| workflow ou manifesto | entrega/configuração | nenhuma além da base | aceitar e verificar |
| create, modify, delete, rename | categoria do caminho | conforme categoria | aceitar se ambos os lados conhecidos |
| vivo + interno | união fechada | browser-baseline + visual-evidence | aceitar e verificar |
| caminho desconhecido | unknown | fail-closed | rejeitar |
| somente o gate | workflow auditável | audit-contract | aceitar e verificar |

As três suítes base — gate, governança e deploy — correm em toda classificação aceite. Não existe estado aceite sem pelo menos essas verificações. A ordem dos caminhos não altera categorias ou suítes.

`src/img/video.mp4` continua fora do payload FTP, mas não fica invisível à PR: é classificado como vídeo e recebe o gate universal.
