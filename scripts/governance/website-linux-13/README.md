# Website Linux diagnostic13 — PROPOSTA, NÃO REGISTRADA

Este diretório e `.github/workflows/website-linux-diagnostic-13.yml` constituem um diagnóstico manual separado. Não é deploy, required check, READY, aprovação Via A ou integração funcional. Nenhum arquivo do site/pacote12 é corrigido aqui.

## Três atos futuros, sem atalhos

1. **Registro e fonte, sob autorizações próprias.** Criar uma branch de governança a partir da main então reconfirmada; adicionar somente os 12 caminhos do diff proposto (workflow novo + este diretório), abrir PR, medir CI, obter revisão e autorização normal de integração. Não alterar workflows existentes, Sentinel ou proteção para registrar. Se a governança recusar algum caminho/trigger, parar e obter decisão nominal específica, não contornar. Após o merge de registro, medir seu SHA real `W`; este ainda NÃO EXISTE e não é substituído por um digest de arquivo. Em autorização separada, publicar a cadeia que contém `563f3c13665347b2a8578110e519ebaf13f356e8` exclusivamente em branch-fonte `agent/website-linux-13-source`, depois de verificar destino/ancestralidade. Não fundir essa branch, não abrir PR funcional por inferência. Um checkout remoto por SHA só funciona depois da publicação dos objetos. Nenhum bundle/fonte é transferido nesta preparação.
2. **Uma autorização nominal e um dispatch.** Reconfirmar workflow registrado na defaultbranch `main`, main em `W`, fonte pública563 e hashes abaixo. A autorização deve nomear Rafael, `W`, fonte563, pacote12, workflow, ref `main`, ID único `WEBSITE-LINUX-13-YYYYMMDD-NN`, downloads/tetos e retenção14dias. Emitir UMA chamada manual ao workflow diagnóstico; jamais chamar deploy.yml. O rótulo `--ref` sozinho não registra workflow. Não rerodar nem substituir run falhado; um novo intento requer nova decisão humana.
3. **Medição/análise.** Verificar preflight e resultado de prepare; só então o wrapper mede uma vez. Qualquer falha interrompe. Coletar artefatos saneados antes da VM desaparecer; analisar conclusão e limites. Exit0 do wrapper não concede READY nem resolve matriz, base3656 versus456/conjunto vivo ou revisão63. Uma falha de host/recursos deve parar; não instalar Docker, usar sudo, prune, WSL, self-hosted ou recursos Memória.

O workflow foi serializado em JSON válido (subconjunto YAML1.2) no arquivo `.yml`, para permitir parsing local sem instalar um parser. O esquema/registro/execução real do GitHub ainda não foi exercitado. Actions de checkout e upload são fixadas em SHA completo; o wrapper exige Node já disponível >=22. Node do measurement e browsers vêm exclusivamente da imagem pinada.

## Identidades e autoridade

- Fonte/head: `563f3c13665347b2a8578110e519ebaf13f356e8`; pai `52479f08b127dc96c4297af0d033ee1508960e24`; árvore `ad5f79ab358e7de04d3de52c45f697f7134dc573`.
- Pacote12: `59c72e2fb8a6043d0a1f68a2a4871a4c385e8611f655d316bc7f0cca728df0f4`; sete arquivos em package12 byte-idênticos. Executor `0df8237acf323a116dd70173b10bc43c14afb211b0404fa42ecef2d585ebae63`.
- Imagem: `mcr.microsoft.com/playwright@sha256:02bbb2155cd7109e3e9c741941097ed1608cf8b6fa44ee2595896da2bdc1f471`, linux/amd64. Playwright JS1.62.0 pelo lock canônico, browsers1234/1538/2336. `source-package.json` registra blobs, tamanhos e SHA256; não é uma expectativa vinda da aplicação.
- Wrapper e pacote vêm do checkout `W` aprovado; aplicação vai para checkout separado por SHA563, profundidade0. O wrapper verifica HEAD/árvore, limpeza, histórico não shallow e package.json/lock por blob100644 e SHA256. Gera no runner bundle com HEAD e toda a ancestralidade. Não usa node_modules Windows como runtime Playwright.
- Autorização é externa, não embutida no commit. Inputs devem corresponder exatamente ao SHA/evento/ref providos pelo GitHub. A string nominal não é assinatura criptográfica nem substitui review/autoridade humana. O chamador da lógica nos testes é confiável; fakes de I/O não são uma interface oferecida à aplicação.

## Preflight e execução única

Antes de qualquer pull/npm: Linuxx64 Ubuntu24.04, Dockerlinux/amd64 cgroupv2 acessível, pelo menos2CPU,6GiB disponíveis de RAM no host/daemon e10GiB livres em `/var/tmp`. Reconfere disco depois de gerar bundle. A especificação pública4CPU/16GB/14GB não garante espaço livre; não há prune automático. Diretório `/var/tmp/branct-website-linux-11` e nomes `website-11-npm`/`website-11-measure` precisam estar ausentes. Esses nomes antigos são conservados para reutilizar o launcher12 intacto.

Guarda local cria raiz exclusiva/receipt por runID; estado existente/incompleto recusa. `GITHUB_RUN_ATTEMPT` deve ser1. Consulta GET público de histórico do workflow deve conter toda a lista (máximo100); somente o run atual pode usar o ID nominal. Erro HTTP, paginação excedida, ausência da entrada atual, duplicação ou histórico incompleto recusam, sem retry. `concurrency` serializa este workflow. Histórico apagado por administrador não é comprovável pelo mecanismo; exige trilha humana preservada e é limite declarado, não proteção contra administrador hostil.

Somente após as guardas: `future-linux.sh --human-authorized-linux-11 prepare`, depois `measure`, ambos intactos do pacote12. prepare pode baixar a imagem/npm, com `npm ci --ignore-scripts --no-audit --no-fund` dentro de container, nunca scripts do site no host. Nenhum token/env de GitHub é herdado pelos filhos/container; o token padrão read-only de checkout permanece fora. A consulta de histórico público não envia token.

Measurement:2CPU/4GiB,512PIDs,shm1GiB,tmpfs1GiB, fonte/Git/runtimeRO, output próprioRW, `--network=none`, sem porta, socketDocker, hostIPC, privilégio extra, credenciais ou envfile. npm usa2GiB/256PIDs. Job110min; teto prepare20min/measure70min deixa margem para encerramento/upload, sem aumentar as asserções da aplicação. Não altera deadlines internos nem pinos/flags.

Qualquer exit não zero/erro/sinal/status desconhecido para imediatamente, inclusive semântica. preparefalho nunca inicia measure. O executor12 mantém complete/84/41/184/4PASS; saída0 sozinha não basta. Depois de falha só saneamento/coleta/encerramento. Para parar container, exige nome exato, ID único, imagem pinada, criação após receipt e mount da raiz própria. Falha de prova não permite matar outro recurso. Não há rm/prune.

## Evidência e limites de retenção

`always()` coleta e publica somente `metadata.json`, `results.json`, `hashes.json`, `technical.log`, de diretório próprio fora de ambos os checkouts. Não usa continue-on-error; upload verde não apaga falha anterior. Um resultado já coletado não é sobrescrito pela coleta final. Upload ausente/falho deixa a prova incompleta, não PASS.

JSON de browser é projetado em contagens/status/indicadores; strings de página, URLs, conteúdo, mensagens de erro arbitrárias, ambiente, gitconfig e workspace bruto não são enviados. Logs técnicos retêm só contadores TAP numéricos. SHA/tamanho dos logs/raw selecionados são conservados, mas seu conteúdo não. Este saneamento é deliberadamente limitado: os artefatos não permitem reconstruir todo relatório/stack/captura; não comprovam integralmente a matriz/vínculos para integração. A análise é diagnóstica; se faltar detalhe, pedir um novo escopo de evidência, não reenviar raw por inferência.

As comparações `causal-chromium.json` e `causal-webkit.json` têm projeção dedicada. Conservam os dois resultados PASS/INCONCLUSIVE separados por engine, versão numérica, contexto, variante fechada e deadline. Chromium conserva contagem de amostras, último tempo decorrido, retângulo/foco/animação finais; WebKit conserva `loadCompleted`, readyState, networkState, código numérico de erro, duração e estado enumerado do documento. Presença de erro vira apenas booleano. Não se conservam mensagem, URL, eventos/journal brutos ou conteúdo arbitrário. Comparação incompleta, variante duplicada/desconhecida ou métrica malformada provoca COLLECTION_FAILED; não se inventa resultado para a variante ausente. A projeção conserva o resultado declarado pelo executor12, sem promovê-lo a aceitação. Testes sintéticos e leitura dos artefatos Windows históricos verificam essa interface; não são resultados Linux nem nova execução dos probes.

Retenção proposta:14dias, artefato por runID. Containers, bundle e raw existem somente durante a VM efêmera; não persistem após o job, mesmo se o launcher original os deixa no host. Não confundir retenção do artefato com preservação da VM. Falha/cancelamento brutal do runner pode impedir coleta; isso é INCONCLUSIVE.

## Texto nominal futuro (preencher somente após registro)

“Pessoa:Rafael. Autorizo uma única execução de `website-linux-diagnostic-13.yml`, refmain, wrapper/main no SHA real W informado no readback, fonte563f3c13665347b2a8578110e519ebaf13f356e8, pacote12 digest59c72e2fb8a6043d0a1f68a2a4871a4c385e8611f655d316bc7f0cca728df0f4, ID único WEBSITE-LINUX-13-YYYYMMDD-NN. Autorizo o runner GitHub-hosted ubuntu24.04x64, checkout/bundle dessa fonte já publicada, pull da imagem por digest acima, npmci do lock exato e os tetos/retensão14dias deste pacote. Uma tentativa, sem retry/rerun. Preflight insuficiente ou filho nãozero/indeterminado interrompe; somente coleta saneada e parada de recursos próprios após falha. Não autorizo deploy, produção, integração/READY, alteração de proteção, recursos Memória ou WSL.”

Após essa autorização específica, o operador construirá o campo `authorization` como `AUTHORIZE <ID> <W> 563f3c13665347b2a8578110e519ebaf13f356e8 59c72e2fb8a6043d0a1f68a2a4871a4c385e8611f655d316bc7f0cca728df0f4`. Não executar com W/ID fictícios. Este texto é modelo para decisão, não autorização emitida.

Rollback: nesta fase, não registrar/não executar a proposta; nenhum revert do site é necessário. Depois de um futuro registro, eventual retirada do workflow passa por nova PR normal. Após dispatch autorizado, cancelamento/parada somente do run/containers comprovadamente próprios, preservar artefatos sem prune; não remover proteção.

## Fontes oficiais consultadas em 10/09/2026

- Recursos/VM efêmera: https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- Registro na defaultbranch para manual dispatch: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
- Histórico de runs: https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2022-11-28
- JSON é subconjunto YAML1.2: https://yaml.org/spec/1.2.2/

Nenhuma destas fontes comprova que este workflow já existe ou que a candidata passou em Linux.
