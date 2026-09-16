# WEBSITE27 — complemento técnico local, não release

Status: proposta versionada de admissão/medição. Nenhuma aprovação Via A, baseline GREEN,
integração, dispatch ou publicação foi criada por este pacote.

## Identidades fechadas e separadas

- Base/main lida: `851c1723119b62193623fa24e67090afd18b39f1`.
- PR67/pai técnico: `33829b3ce21ff3032ca2efc02d4a06aa7b39d759`, draft.
- Única candidata funcional: `2fbce7cdd1ff87f9a54d8c9190ffd1f349a8fe9d`, árvore `a29075560b9c97fce9a65bccd328cfb8082a25f1`.
- Teste confiável: fonte `563f3c13665347b2a8578110e519ebaf13f356e8`, blob `8cc07c7f4c0937677f4f2357d6b8c687e87a41ec`, SHA256 `9606d616d3dc132235453e93a7b8a4d4f41953e03803a7382f8aee9f81409118`.
- O teste histórico da main/candidata26 é outro blob: `49a9fc3e5e1a98fc595f4ac6842e29b2e20fb1f6`. Não foi renomeado documentalmente para o teste563.
- Matriz independente v2 da base:41 identidades/184 ações;12 rotas×7 viewports=84 por engine, incluindo320 e412. `contract.json` fixa bytes/mode/blob/SHA256 de cada autoridade e dos56 arquivos publicados.
- O `source` interno `a47abb…` do relatório é etiqueta histórica do teste intacto; o envelope externo do consumidor registra a candidata26 e o teste563 separadamente. Não é prova de execução do commit histórico nem aprovação transferida.

## As quatro falhas26

`F2_GOV_AUTHORITY_SHA` faltava em dois testes. O launcher local exige SHA completo,
resolvível e admitido; não inventa evento GitHub nem usa HEAD como autoridade implícita.
Outros dois imports abriam fisicamente `node_modules/playwright-core/browsers.json` na
árvore auditada. Resolver apenas `import playwright` não resolve esse acesso.

`runtime.mjs` verifica o pacote completo existente1.62.0/core1.62.0, lock e builds
1234/1538/2336. Copia os dois diretórios reais, incluindo o registry original, para
uma clone descartável nova; registra digests de todos os173 arquivos. Não instala,
não baixa, não sintetiza registry, não copia revisão de outra versão e não toca na
worktree original. A cópia local não equivale à imagem Linux nem valida bináriosFirefox.

Reprodução dos quatro contratos no candidato26, sem a proposta27:

```powershell
node scripts/governance/website-candidate-27/runtime.mjs audit . 2fbce7cdd1ff87f9a54d8c9190ffd1f349a8fe9d C:/CAMINHO/EXISTENTE/sitebranct-website-webkit-21 C:/OUTPUT/NOVO/audit26
```

Resultado medido:46/47 (subtestes incluídos). Só permanece `audited diff contains an
unauthorized path`. A execução devolve código não-zero; não se oculta a recusa.

## Evolução de admissão proposta

O ramo novo do guardião é ativado exclusivamente pelo SHA2fbce7c. Verifica pai851c,
árvore imutável, raw diff NUL/no-renames, sete caminhos exatos com modos100644,
blob/tamanho/SHA256 e autoridades. WEBSITE15/24 continuam iguais para qualquer
outro commit. Não admite uma oitava alteração, runtime pin, deploy, rename, diretório
ou SHA “equivalente”. A transição histórica continua IN_DEVELOPMENT; a baseline
histórica e a baseline alvo permanecem byte-idênticas.

Essa exceção admite somente **o pacote já fechado para medição**, não um merge futuro
que naturalmente terá outro SHA/base. Não remove a política visual atual nem autoriza
o guardião Universal a integrar conteúdo vivo. Após medição completa, a proposta de
transição READY precisa referenciar as provas realmente produzidas e ser revisada;
nunca haverá baseline inventada ou approval dentro do próprio commit.

## Executor canónico concreto

`executor.mjs` materializa só os56 blobs vivos26 e controles canónicos fixados.
Não executa testes/comandos fornecidos pela candidata26. Executa o teste563 intacto,
sequencialmente em Chromium/Firefox/WebKit, com900000ms por filho (mesmo teto21),
exigindo término normal, vetor4PASS,84/41/184, bijeções, geometria/menu/reduced-motion
e relatório de isolamento. Toda falha/interrupção/engine omitida rejeita. A saída é
`TECHNICAL_MEASUREMENT_COMPLETE_NOT_READY`, nunca Via A nem baseline aprovada.

Reutiliza a fronteira browser do pacote21 sem mudar esse pacote. A medição precisa
de Linux/amd64, imagem `mcr.microsoft.com/playwright@sha256:02bbb2155cd7109e3e9c741941097ed1608cf8b6fa44ee2595896da2bdc1f471`, deps1.62.0 físicas pelo lock, cache `/ms-playwright`, namespace sem rede, mounts RO e fonte sem credenciais. Sem pacote existente compatível, parar; instalação/pull requerem autorização própria. `docker` não está disponível neste host; nenhum container foi executado27.

Comando interno fixo: `node /control/scripts/governance/website-candidate-27/executor.mjs container`.
Mounts futuros: Git objects completo local e sem credenciais em `/repository` RO;
checkout técnico revisado em `/control` RO; deps Linux canónicas em `/deps` RO;
diretório novo de prova em `/outputs` RW. O launcher Docker deve usar `--pull=never
--platform linux/amd64 --network=none --init --read-only --cap-drop=ALL
--security-opt=no-new-privileges --memory=4g --cpus=2 --pids-limit=512 --shm-size=1g
--tmpfs /tmp:rw,nosuid,nodev,size=1g --env PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`.
Nenhum socketDocker, portas, envfile, token ou API é montado. A imagem é a acima,
nunca tag. Inspecionar digest/arquitetura no host antes; declaração dentro do container
sozinha não prova digest. Dados brutos ficam locais, não há upload implementado27.

Os três relatórios completos, hashes, processos, source/test identity e isolamento
ficam em `/outputs/measurement`. Não reciclar evidência19/21 como execução26. O wrapper21
continua WebKit exclusivo563. Não passar2fbce7c ao seu workflow. Este complemento não
cria workflow novo: futuro operador/CI pertinente deve integrar o comando exato sob
autorização revisada, sem reutilizar dispatch ou autorizaçãoPR66.

## Decisão humana concretizável agora versus dependências reais

O relatório externo selado fixa o HEAD técnico e todos os hashes após commit, permitindo
autorizar **apenas publicação dessa branch técnica e PR draft dependente daPR67**, sem
alterar a PR67 nem publicar fonte viva na main. Deve-se reconfirmar base/pai remoto.
CI/revisão formal/integração são gates distintos, não concedidos por esse push.

Executar o comando Linux só após disponibilizar a fonte2fbce7c e o checkout técnico
exatos, runtime Linux com locks/digest e autorização do host/recursos. Isso não depende
de inventar um futuro SHA de merge: ambos os commits existem localmente. No host atual,
a ausência de Docker/Linux compatível é dependência real, não uma razão para reabrir
o desenho ou pedir “autorize preparar”. Publicação de objetos-fonte em branch isolada,
se necessária ao runner, é ato humano separado de merge/release.

Se a publicação técnica exigir Sentinel excepcional por `tests/audit/site-audit.test.mjs`,
preparar snapshot/readback integral, exceção mínima dessa required check, janela máxima
15min, merge normal preso ao SHA aprovado e restauração imediata em sucesso/falha.
Não executar nesta proposta. A configuração real deve ser lida novamente na cerimónia;
não se inventa snapshot atual nem se reutiliza autorizaçãoPR66.

## Release/rollback

O deploy vigente aciona em pushmain comHTML/CSS/JS. Merge da candidata viva poderia
publicar porFTP: **não é um merge técnico sem deploy**. Requer prova final e autorização
própria de release. Este pacote não muda workflow/deploy/manifesto/proteção.
Rollback local: manter commits/patch sem aplicar. Futuro rollback de integração:
nova PR protegida de revert do merge real, não reset nem pushdireto; repetir gates e,
se conteúdo vivo estiver envolvido, autorização própria para publicar o revert.
