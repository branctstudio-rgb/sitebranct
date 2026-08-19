# F2-GOV-02D — observação base-only

## Objetivo do ensaio

Provar numa pull request descartável e benigna que a Gate Integrity Sentinel integrada na `main` inspeciona os metadados públicos a partir da definição da base e termina em PASS sem executar conteúdo da branch.

## Base

`3fd31e615a8914aaa1b1d7bcb0a093222eb678ce`

## Resultado esperado

A Gate Integrity Sentinel inicia automaticamente em `pull_request_target`, inspeciona exclusivamente este caminho documental público, confirma que ele não pertence ao conjunto protegido e termina em PASS. O Universal PR Gate também termina em PASS; o Offline audit contract termina em PASS se for acionado.

## Proibições

Esta pull request é descartável e não pode ser fundida. O ensaio não autoriza deploy, FTP, `workflow_dispatch`, acesso a secrets, alteração ou publicação em produção.
