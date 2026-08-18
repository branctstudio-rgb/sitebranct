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

Esta lista em `push.paths` é a definição canónica. Antes de instalar ou invocar `lftp`, `scripts/deploy/build-publish-payload.mjs` lê essa mesma definição, valida-a contra a política fechada e copia somente ficheiros Git autorizados para `${RUNNER_TEMP}/branct-publish`. O mirror usa exclusivamente essa pasta temporária, nunca a raiz do repositório. Alterar o próprio workflow não pertence à lista de push e não publica automaticamente. `workflow_dispatch` permite execução manual deliberada somente a partir da `main`. Em pull requests, somente `verify-scope` executa; o job `deploy` rejeita o evento.

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

A matriz vive em `tests/deploy/deploy-scope.test.mjs`. `expected-payload.json` mantém uma lista explícita e independente dos 56 ficheiros publicados atuais. O teste enumera a árvore produzida e exige igualdade exata, sem reutilizar o classificador como oráculo. Há negativos permanentes para PR #2, testes, fixtures, documentação, workflows, dependências, diretórios desconhecidos, ficheiros obrigatórios ausentes, duplicações, travessia e symlinks.

## RED→GREEN

RED inicial da missão: 4/5 testes falharam na base. O caso “somente documentação” devolveu `true`; não existiam `workflow_dispatch`, separação PR/deploy ou Actions pinadas.

RED desta correção: 6/7 testes passaram e o negativo do payload falhou com quatro entradas indevidas: teste atual, teste e fixture projetados da PR #2 e diretório desconhecido.

GREEN: 8/8 testes passam. O pacote contém exatamente os 56 ficheiros listados no contrato independente, e zero ficheiros de `tests/`, `fixtures/`, `docs/`, `.github/`, dependências ou diretórios desconhecidos. O destino FTP, nomes dos secrets, opções de sincronização e `--delete` permanecem no workflow; somente a origem do mirror mudou de `./` para o staging fechado.

## Riscos e rollback

- Um novo tipo de caminho vivo exigirá atualização deliberada da política canónica, do construtor e do contrato independente. Por desenho, a omissão falha fechada.
- A lista explícita dos 56 ficheiros é um snapshot da árvore atual. Adicionar ou remover um asset vivo exige atualizar esse contrato no mesmo PR.
- `workflow_dispatch` é uma capacidade manual sensível, limitada pela condição do job à `main`, e deve ser usada somente por operador autorizado.
- Rollback: reverter exclusivamente o commit corretivo para o head anterior da PR. Isso reabre o payload da raiz e não deve ser fundido; a alternativa segura é desativar o workflow até corrigir.

## Gate

Nenhum FTP, deploy, secret, produção, página, CSS, JavaScript ou asset vivo foi tocado. Parar antes do merge e aguardar revisão defensiva e autorização humana.
