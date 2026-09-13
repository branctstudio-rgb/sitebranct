# WebKit exclusivo — candidato de diagnóstico 21

Este pacote NÃO corrige a falha WebKit, NÃO representa aceite funcional e NÃO autoriza execução/publicação. A execução19 (34763767306) foi consumida: Chromium/Firefox e pares causais passaram; WebKit responsivo ficou incompleto e a causa interna continua UNKNOWN. Não repetir a campanha13.

## Fonte e fronteira

- Base do candidato: `851c1723119b62193623fa24e67090afd18b39f1`.
- Aplicação: `563f3c13665347b2a8578110e519ebaf13f356e8`, árvore `ad5f79ab358e7de04d3de52c45f697f7134dc573`.
- O wrapper/pacote vêm da futura main aprovada; a aplicação é checkout separado, sem credenciais persistidas, e só executa dentro do container sem rede.
- `source-package.json` fixa imagem linux/amd64, Playwright1.62.0, quatro blobs da aplicação (package, lock, teste e matriz) e três componentes do pacote. Pins do pacote derivados de blobs Git canônicos.
- O arquivo integral `tests/audit/f2-01-responsive.test.mjs` da aplicação e o site-contract são imutáveis. Todos os84 casos,41 menus,184 ações, sete viewports incluindo1024x768, ordem, semântica e deadlines permanecem os da fonte. Não há captura configurada.
- O adaptador `linux-responsive.mjs` é byte-equivalente ao aprovado, salvo a guarda que restringe engine a WebKit. Não remove cenários nem faz reparos na página.

## Comando e tarefas fechadas

O launcher chama somente `node /package/linux-run.mjs`. O condutor emite exatamente um filho: `node /package/linux-responsive.mjs`, cwd `/candidate`, `F2_01_BROWSER=webkit`, relatório `/outputs/results/responsive-webkit.json`, teto900000ms. Ele rejeita seleção diferente antes de iniciar. Não há lexical, webkit-webm, causal, Chromium ou Firefox. Os outros browsers podem estar contidos na imagem/dependência comum, mas não são lançados.

`runWebKit` exige relatório legível completo, versão realWebKit26.5,84/41/184,açõesCOMPLETED,4semanticPASS e isolamento sem tentativas/violações. Exit0 sozinho nunca basta; o estado de êxito é `WEBKIT_DIAGNOSTIC_COMPLETE_NOT_ACCEPTANCE`.

## Observabilidade saneada

Quatro artefatos fixos: metadata.json,results.json,hashes.json,technical.log; retenção14dias. Nenhum raw, bundle, screenshot ou workspace é enviado como artefato. Os raw permanecem somente no disco efêmero para projeção/hash.

- O wrapper preserva estágios prepare/measure, exit e presença de erro/sinal e resultado de cleanup.
- A recuperação sempre tenta um envelope mínimo quando uma leitura é rejeitada; cleanupfalho impede leitura de outputs potencialmente ativos. Metadata isolado não conta como conjunto completo. Disco/saída sem escrita continua COLLECTION_FAILED e não é anunciado como artefato preservado.
- O summary do filho preserva code/stage fechados, exit, erro de processo PROCESS_TIMEOUT/UNKNOWN e sinal SIGTERM/SIGKILL/SIGINT/UNKNOWN.
- O responsivo preserva contagens, complete,vetorsemântico, ordem das ações, oito fases fechadas, COMPLETED/TIMEOUT/ERROR/UNKNOWN e a última fase registrada.
- ACTION_TIMEOUT só vem do statusTIMEOUT emitido pelo ActionTimeout pinado. ERROR vira ACTION_ERROR_UNSPECIFIED; não inventa assertion, timeout nativo ou media. Texto de infraestrutura não é interpretado: detalheUNKNOWN.
- Informação perdida na execução19 não é reconstruída. Campo ausente/malformado permaneceUNKNOWN. O projetor não é autoridade de aceitação.

## Testar sem operação

Requer Node>=22 e objetos Git locais da base/aplicação. Sem npm install, browser, Docker, rede ou evento:

```
node scripts/governance/website-webkit-21/validate.mjs LF
node scripts/governance/website-webkit-21/validate.mjs CRLF
```

O validador usa testes inertes da fronteira host/child, executa guards reais e cria somente provas sintéticas em diretórios temporários; não modifica repositório/index/refs. `GIT_NO_LAZY_FETCH=1` impede downloads implícitos. A varianteCRLF mantém blobsautoridade no repositório original. Timeout de teste local não altera deadline funcional.

Testes cobrem fonte/browser/cache/revisão errados, identificador duplicado/consumido, tentativa2, marcadorprévio, falha prepare/measure, timeout/sinal/nonzero, relatório ausente/truncado/incompleto, falha coleta/cleanup, privacidade, pacote adulterado e mutações. Invariantes comparam bytesintegrais do teste e do adaptador; comando recebido pelo executor inerte é comprovado, não inferido de env.

## Orçamento e recursos futuros

O job mantém110min, sem redução ainda não demonstrada. Teto prepare20min; teto host measure70min herdado como limite externo; filhoWebKit15min; cleanup cada container10s. Nenhum timeout funcional foi aumentado. A folga cobre checkout/imagem/coleta e não autoriza rerun. Runner ubuntu24.04 x64: mínimo2CPU/6GiBdisponíveis/10GiBdiscolivre; container medição4GiB/2CPU/pids512/shm1GiB; install2GiB/2CPU/pids256. Infraestrutura insuficiente falha antes do ensaio.

Downloads somente em prepare: imagem oficial por digest e `npm ci --ignore-scripts --no-audit --no-fund`, lock exato, browserdownload desabilitado. Medição usa `--network=none --read-only --cap-drop=ALL --security-opt=no-new-privileges`, sem sockets/credenciais/ports/IPCcompartilhado. O namespace sem rede é fronteira operacional proposta; não foi executado neste preparo.

## Limites e rollback

Linux/browser real do candidato: NOT_VERIFIED. Os testes offline não provam funcionamento real do Docker/GitHub nem o motivo do erroWebKit. O pacote não muda aplicação, workflowsantigos, PR63,proteção ouprodução. Restaurar conteúdo após futura integração exige nova PR protegida de revert; neste preparo, basta não publicar/aplicar o candidato. Ver EXECUTION.md para dois atos humanos distintos.
