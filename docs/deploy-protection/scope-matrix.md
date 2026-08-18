# Proteção do deploy FTP por escopo

Issue-lock: #3

Base: `main@da8800cd7669f66a82cbf9cd2e4f22fa99d59320`

Branch: `agent/deploy-scope-guard`

## Estado observado

O workflow anterior tinha `push.branches: [main]` sem filtro de caminhos. Portanto, qualquer merge/push na `main` — inclusive somente documentação, testes, fixtures ou workflow de auditoria — iniciava o job que contém FTP.

No head bloqueado `94450a00c8a2a73fe587f2cb1de954a8acc75196`, o `lftp mirror` ainda usava a raiz `./`. A reprodução offline mostrou quatro fugas no payload efetivo: `tests/deploy/deploy-scope.test.mjs`, o futuro `tests/audit/site-audit.test.mjs`, o futuro `fixtures/audit/baseline-results.json` e `unknown/private.txt`. Nenhum comando FTP foi executado; o RED foi calculado a partir da árvore Git e das exclusões reais do comando.

## Lista positiva automática

- `*.html`
- `.htaccess`
- `robots.txt`
- `sitemap.xml`
- `src/css/**`
- `src/js/**`
- `src/fonts/**`
- `src/i18n/**`
- `src/img/**`, mantendo a exclusão já existente de `src/img/video.mp4`

Esta lista em `push.paths` é a política canónica de tipos. O manifesto operacional `deploy/publish-manifest.json` é a lista exata de instâncias atualmente publicadas. Antes de instalar ou invocar `lftp`, `scripts/deploy/build-publish-payload.mjs` lê e valida as duas camadas, exige igualdade exata entre árvore selecionada e manifesto, e copia somente esse conjunto para `${RUNNER_TEMP}/branct-publish`. Um caminho precisa ser autorizado pela política e constar no manifesto; nenhuma camada amplia a outra. O mirror usa exclusivamente a pasta temporária, nunca a raiz do repositório.

Alterar o próprio workflow ou manifesto não pertence à lista de `push` e não publica automaticamente. `workflow_dispatch` permite execução manual deliberada somente a partir da `main`. Em pull requests, qualquer alteração viva, do workflow, construtor, manifesto, testes ou documentação de deploy inicia somente `verify-scope`; o job `deploy` rejeita o evento.

## Tabela de verdade executável

| Caso | Deploy automático |
|---|---|
| Somente `docs/audit/**` | não |
| Somente `tests/**` | não |
| Somente `fixtures/audit/**` | não |
| HTML raiz | sim |
| `src/css/**` | sim |
| `src/js/**` | sim |
| Imagem/media publicado | sim |
| Fonte publicada | sim |
| Tradução `src/i18n/**` | sim |
| Documentação + ficheiro vivo | sim |
| Somente workflow de auditoria | não |
| Somente workflow de deploy | não |
| `src/img/video.mp4` | não |
| `workflow_dispatch` autorizado na `main` | permitido |

A matriz vive em `tests/deploy/deploy-scope.test.mjs`. `deploy/publish-manifest.json` mantém os 56 ficheiros publicados atuais e é consumido pelo construtor real e pelos testes. A suite enumera a árvore produzida e exige igualdade exata com o manifesto. Há negativos permanentes para PR #2, testes, fixtures, documentação, workflows, dependências, diretórios desconhecidos, ficheiro permitido extra, ficheiro manifestado ausente, manifesto proibido/duplicado/ausente/ilegível/schema inválido, travessia e symlinks.

## RED→GREEN

RED inicial da missão: 4/5 testes falharam na base. O caso “somente documentação” devolveu `true`; não existiam `workflow_dispatch`, separação PR/deploy ou Actions pinadas.

RED desta correção: 6/7 testes passaram e o negativo do payload falhou com quatro entradas indevidas: teste atual, teste e fixture projetados da PR #2 e diretório desconhecido.

GREEN do fecho da raiz: 8/8 testes passaram. O pacote continha exatamente os 56 ficheiros então listados no contrato de teste, e zero ficheiros de `tests/`, `fixtures/`, `docs/`, `.github/`, dependências ou diretórios desconhecidos. O destino FTP, nomes dos secrets, opções de sincronização e `--delete` permaneceram no workflow; somente a origem do mirror mudou de `./` para o staging fechado.

RED da vinculação operacional: 8 testes anteriores passaram e 3 novos falharam. O construtor aceitou `novo.html`, aceitou a remoção de `src/css/main.css` e `index.html` não disparava a verificação de PR.

GREEN da vinculação operacional: 13/13 testes passam. O construtor real carrega o manifesto antes do staging e aborta por qualquer diferença extra/ausente ou manifesto inválido. Todos os tipos de caminhos vivos e o manifesto estão no filtro da verificação de pull request.

## Riscos e rollback

- Um novo tipo de caminho vivo exigirá atualização deliberada da política canónica, do construtor e do contrato independente. Por desenho, a omissão falha fechada.
- O manifesto operacional de 56 ficheiros é um snapshot da árvore atual. Adicionar ou remover um ficheiro vivo exige atualizar o manifesto no mesmo PR; caso contrário, tanto CI como o construtor real abortam.
- `workflow_dispatch` é uma capacidade manual sensível, limitada pela condição do job à `main`, e deve ser usada somente por operador autorizado.
- Rollback: reverter exclusivamente o commit corretivo para o head anterior da PR. Isso reabre o payload da raiz e não deve ser fundido; a alternativa segura é desativar o workflow até corrigir.

## Gate

Nenhum FTP, deploy, secret, produção, página, CSS, JavaScript ou asset vivo foi tocado. Parar antes do merge e aguardar revisão defensiva e autorização humana.
