# Ensaio Linux pinado — pacote12, NÃO EXECUTADO

**SEM AUTORIZAÇÃO DE EXECUÇÃO LINUX.** O Important11 foi tratado na missão12 por parada conservadora: qualquer saída diferente de zero, erro, sinal ou status desconhecido interrompe depois do registro, inclusive falha semântica. Nenhuma classificação por stderr. Provas comportamentais locais23/23; revisão excepcional dirigida em REVIEW.md. Este resultado não é execução Linux nem aprovação operacional; runtime/matriz/base continuam pendentes. Pacote11 e suas rondas2/2 preservados, não reescritos.

Fonte: `563f3c13665347b2a8578110e519ebaf13f356e8`, árvore `ad5f79ab358e7de04d3de52c45f697f7134dc573`. Sem política alterada, sem novo CI. Scripts possuem gates explícitos; não chamar nesta missão.

## Identidade e recursos

Metadados GET oficiais MCR conferidos em `official-image-metadata.json`: tag `v1.62.0-noble`, índice `sha256:baed2032d533817f3dbe6425de795788430ba345e819a1201337009ba17c9d07`, filho **linux/amd64** `sha256:02bbb2155cd7109e3e9c741941097ed1608cf8b6fa44ee2595896da2bdc1f471`. Camadas comprimidas: 947006567 bytes (~903MiB), NÃO baixadas. Não executar por tag móvel.

A [documentação oficial Playwright](https://playwright.dev/docs/docker) distingue browsers/dependências de sistema do pacote JS: este não acompanha a imagem. `prepare` usa o package.json/lock exatos da candidata e `npm ci --ignore-scripts --no-audit --no-fund`, Playwright1.62.0 e download implícito de browsers desligado. Nenhum node_modules Windows é copiado como runtime. O Git histórico contém632ficheiros em node_modules; permanecem intactos. Somente diretórios ignorados playwright e playwright-core recebem mounts read-only do npm Linux separado, mantendo a árvore Git limpa.

Engines exigidas: Chromium151.0.7922.34/rev1234, Firefox153.0/rev1538, WebKit26.5/rev2336, cache `/ms-playwright`. Runtime e versões divergentes recusam. A versão Node vem da imagem imutável e é registrada, não inferida do host.

Ambiente **separado** de Memória09: Linux x86_64 com Docker já aprovado/instalado, diretório exclusivo `/var/tmp/branct-website-linux-11`; containers `website-11-npm` e `website-11-measure`. Nenhum volume/banco/máquina `branct-memory-dev-01`, PostgreSQL, porta55432, credencial ou orçamento global WSL será usado. A CLI Podman/máquina futura da Memória não foi declarada disponível; este executor concreto é Docker, sem fallback. Provisionar host/runtime compatível exige autorização própria. WSL presente sem distro não satisfaz essa condição.

Proposta de teto: 2CPU, 4GiB RAM no measurement, shm1GiB, tmpfs1GiB,512PIDs; preparação2GiB/256PIDs. Reservar ao menos10GiB livres para imagem, bundle, clone e logs (não cota de disco implementada). Não usar host IPC, socket Docker no container, portas publicadas, capabilities extras ou volumes existentes. Containers e arquivos preservados após saída.

## Entrada/execução futuras

1. Aprovar host Linux dedicado, transferência do bundle e downloads imagem/npm. Não alterar WSL global nem usar máquina de outra missão por inferência.
2. No Windows, na pasta deste pacote: `./prepare-input.ps1 -Execute`. Confere head e worktree, exporta HEAD com sua ancestralidade num bundle, copia quatro scripts e gera SHA256SUMS; recusa destino existente. Não inclui arquivos não rastreados da worktree nem cache Windows.
3. Transferir somente o diretório resultante `linux-input` para `/var/tmp/branct-website-linux-11/input` no host autorizado. Comparar SHA256SUMS com a origem por canal humano; não tratar checksum transportado junto como autenticação independente. Diretório novo, regular, sem symlinks, proprietário usuário executor.
4. `bash /var/tmp/branct-website-linux-11/input/package/future-linux.sh --human-authorized-linux-11 prepare`
5. Conferir exit0, versão/pins, recursos e ausência de drift. A preparação permite rede só para pull/npm; não executa o site nem scripts npm. Não há token/secrets/envfile.
6. `bash /var/tmp/branct-website-linux-11/input/package/future-linux.sh --human-authorized-linux-11 measure`

Measurement recebe fonte/objetos Git e runtime JS RO, outputs RW próprios, sem credenciais e `--network=none`; servidor/browser ficam no mesmo namespace loopback. CSP/routing reproduzem isolamento local09/10; nenhuma submissão/consentimento externo. Chromium usa seu headless padrão, sem desativar animações; a variante adicional de flags pertence somente ao diagnóstico causal. O container não é apresentado como enforcement operacional da Via A nem como sandbox contra host administrador.

## Cenários e saída

Uma execução por caso: lexical3testes; F11WebM canónico com load30000; A/B Chromium450ms/deadline2500; A/B WebKit com bytes idênticos; teste responsivo real em três engines, sete viewports,84observações/41menus/184ações, quatro testes semânticos, reduz-motion. `linux-run.mjs` não muda bytes/as­serts do teste; prazo externo é teto do processo, não ampliação da asserção. Relatórios têm head operacional no sidecar; `source` histórico não é reescrito.

Saída: `/var/tmp/branct-website-linux-11/outputs/results`, logs individuais, summary.json, relatórios JSON, digests e sidecars de isolamento. Zero exit é necessário mas não suficiente: exigir complete=true, zero infra,84/41/184,4PASS e análise da matriz/vínculos pela autoridade existente antes de proposta de integração. Esse pacote diagnóstico não declara READY, merge ou cumprimento do gate operacional.

Parar sem repetir se instalação falhar, fonte/pin divergir, engine faltar, teto do processo ocorrer, surgir tentativa externa **ou qualquer filho sair com código não zero**. Isso inclui falha semântica/load: fica registrada e nenhum caso posterior inicia. Não há continuação para completar comparação depois de uma falha, nem rerun até verde. Status desconhecido é registrado como null e recusado. Nenhum status0 HTTP é promovido; exit0 de processo é um conceito distinto e não dispensa complete/84/41/184/4PASS. Final da matriz inválida gera falha mesmo com sete exits0. Diferenças Linux/Windows e disponibilidade de host/Docker permanecem NOT_VERIFIED. Sintaxe e parada foram testadas localmente com substitutos explícitos; comportamento operacional Linux ainda não.

Rollback futuro: parar **somente** `website-11-measure`/`website-11-npm` se ainda ativos; preservar bundle, logs, source e containers. Não apagar máquina/volumes nem executar prune. Nenhuma proteção GitHub muda.

Próximo ato proposto, após parecer dirigido sem bloqueadores: escolher explicitamente um host Linux amd64 dedicado com Docker, isolado da Memória09, e autorizar os recursos/tetos acima, transferência do bundle e downloads da imagem por digest e npm pelo lockfile. Texto: “Autorizo disponibilizar o host dedicado escolhido e executar uma única campanha do pacote12 selado, no head563f3c1, fonteRO/networknone, com parada no primeiro resultado não zero/indeterminado e preservação das provas. Não autorizo site, política, GitHub, WSL global, recursos Memória ou produção.” O método de disponibilização do host precisa ser nomeado; não criar distro/VM por inferência. A missão12 não executa esse ato.
