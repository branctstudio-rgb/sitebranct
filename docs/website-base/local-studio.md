# Bancada local de criação

Na raiz deste checkout, com Node disponível:

```powershell
./fixtures/website-project/studio/start.ps1 -Projects "$([Environment]::GetFolderPath('MyDocuments'))/branct-projetos"
```

Fora do checkout, invocar `start.ps1` pelo seu caminho absoluto em PowerShell 7 (`pwsh`). Não depende da pasta corrente. A raiz/ancestrais são validados antes de criar pasta ou logs; o launcher devolve URL e registo após escuta local, sem aguardar o encerramento do serviço. PowerShell 5 com execução de scripts desativada não é suportado sem decisão própria do operador — não é necessário alterar essa política para usar `pwsh`.

No Windows, ferramentas que capturam a árvore de processos podem aguardar o EOF dos pipes até o servidor parar, mesmo depois de o launcher sair com código 0. Usar o URL/registo emitidos; não iniciar outra sessão só por a ferramenta continuar a aguardar. O teste focal mede separadamente o evento de saída real do launcher e encerra o seu próprio servidor pelo registo.

Abrir o URL `127.0.0.1` retornado. Alternativa, com pasta de projetos já existente: `node fixtures/website-project/studio/server.mjs start CAMINHO_ABSOLUTO_DA_PASTA`.

1. Carregar **BRANCT · receita aprovada** ou uma receita/versão guardada.
2. Editar identidade, paleta, fontes, textos, etapas, rotas e referências do catálogo. O catálogo anterior mantém os assets/pinos BRANCT. A secção de recursos permite selecionar PNGs locais e confirmar a importação; não aceita URLs. A proveniência e a raiz dos assets não são caminhos editáveis no browser.
3. **Validar receita** identifica o primeiro erro do contrato. Corrigi-lo e voltar a validar. Contraste inválido e recursos fora do catálogo são recusados. Imagem informativa exige alt; decorativa usa alt vazio explicitamente. O logo é redundante com o nome visível, por isso usa alt vazio.
4. Dar um nome novo, como `ensaio-v1`. **Guardar receita** salva a configuração. **Gerar e verificar** cria a configuração e 14 ficheiros numa nova revisão e abre os links das duas páginas reais.
5. Editar e usar `ensaio-v2`. A v1 fica intacta. Reabrir pela lista de receitas ou versões; a interface pede confirmação antes de descartar alterações por guardar.
6. **Encerrar esta prévia** fecha só esse servidor. **Encerrar bancada** fecha a sessão e todos os seus previews, guardando recibos. Fechar o separador não encerra o serviço.

Paragem alternativa, com o caminho `record` retornado no arranque:

```powershell
node fixtures/website-project/studio/server.mjs stop CAMINHO_ABSOLUTO_DO_REGISTO
```

Não substitua esse comando por encerramento genérico de Node. Cada arranque tem identidade própria; receitas e revisões persistem na pasta de projetos. Recibos ficam em `sessions`, logs de arranque na raiz. A paragem verifica a sessão viva antes de agir. Para retomar, executar o mesmo arranque e usar o novo URL/registo.

## Limites

Somente loopback e operador local de confiança. Não é servidor público, sandbox para uploads anónimos nem defesa contra outro processo local privilegiado que modifique simultaneamente a pasta. Não mover/substituir assets/ficheiros enquanto serve; adulterações de receita/saída são recusadas ao abrir/servir a prévia. Sem shell, endpoints reais, recolha de contactos, secrets, CRM ou publicação. Conteúdo local-draft, noindex e publicationAllowed=false permanecem obrigatórios. As páginas de contacto são rascunhos sem envio. Revisão de copy, direitos, QA da receita final e autorização de publicação continuam separados.

O editor reutiliza `project.mjs`, `build/generate/verify`, assets/fontes locais e `preview.mjs`; não altera Cedro/Linha, workflows ou páginas vivas. PT-PT, duas páginas, sem novas dependências. Fontes locais fornecidas: Manrope e Bricolage, escolhidas na UI com prévia; não há importação arbitrária de fontes nem inferência de direitos.

## Biblioteca do projeto (WEBSITE43)

Selecionar **Usar como** (logo/imagem), escolher PNG e observar a prévia. Até clicar **Importar para o projeto**, tudo fica em memória no browser. **Cancelar seleção** revoga a prévia sem escrita. Durante o pedido confirmado, a UI fica bloqueada; cancelamento depois de confirmada a gravação não é oferecido como se pudesse desfazê-la.

Limites: PNG estático até 2 MiB e 2048×2048, canais cinzento/RGB com ou sem alpha, 8 bits, sem paleta/interlace/animação. Apenas chunks IHDR/IDAT/IEND e metadata simples sRGB/gAMA/cHRM/pHYs/tIME; outros chunks recusados, sem sanitização silenciosa. CRC, inflação limitada, cardinalidade de píxeis e filtros validados antes de escrever. Não é decoder gráfico universal; confirmar também a prévia real. Ficheiros SVG, HTML, JPEG/WebP importados e fontes arbitrárias não fazem parte desta primeira importação. O SVG/WebP histórico aprovado permanece no catálogo, sem alteração. Exportar os próprios recursos como PNG simples quando necessário; não fazer downloads pela bancada.

Nomes de seleção: ASCII simples até 104 caracteres, sem caminhos, URLs, nomes reservados Windows ou `..`. O nome original é apenas rótulo; o destino é `library/imports/<sha256>.png`, com registo server-owned em `library/catalog`. Dedupe por conteúdo, sem overwrite. Até 64 recursos e 64 MiB por biblioteca. Recurso ausente pode ser reimportado com os mesmos bytes/digest; recurso existente adulterado não é sobrescrito. Alternativamente selecionar outro recurso e criar nova versão. A receita pode ser reaberta mesmo com recurso ausente para permitir essa correção; geração/verificação não aceitam a falta.

O início copia para `library` os inputs históricos já aprovados, verificando igualdade e sem sobrescrever. Receitas v1 e versões guardadas ficam inalteradas. Novas receitas UI usam v2: mesma estrutura, `heroDecorative` explícito e raiz relativa fixa. Receitas guardadas usam `../library`; versões usam `../../library`. `sources` mantém a proveniência histórica da base; os registos de importação identificam a seleção local nova, não um direito ou aprovação de publicação. O manifesto gerado prova os bytes efetivos do logo/imagem/fontes.

Portabilidade: parar a sessão, copiar a pasta de projetos inteira (incluindo `library`, `recipes`, `revisions`) para uma nova pasta local e iniciar esta versão da bancada nessa pasta. As receitas v2 não dependem de Downloads/origem. Outputs `site` são auto-contidos (14 ficheiros); `generate/verify` continua a exigir a ferramenta instalada. Receitas v1 preservadas conservam a sua referência histórica, que não é reescrita automaticamente. Não mover uma pasta com servidor ativo.

## Mais de um projeto (WEBSITE44)

**Projeto** → **Abrir projeto** troca o espaço de trabalho. O nome e identificador ativos ficam acima do editor; o identificador também fica no URL para reabrir o mesmo projeto. O acervo anterior é **Legado 42/43**: nenhuma receita, revisão ou biblioteca anterior é movida ou reescrita.

Em **Criar ou duplicar projeto**, indicar nome de até 48 caracteres e identificador simples e escolher receita BRANCT, ponto de partida do projeto atual, receita guardada ou revisão verificada. Identificadores usam 2–36 letras minúsculas/números/hífen, começam por letra e não são nomes reservados Windows; não são caminhos. `legacy` é reservado. Destinos existentes são recusados. Cada projeto nasce em `projects/<id>` com biblioteca, receitas e revisões próprias; o mesmo nome `v1` pode existir em dois projetos. Não há remoção, renomeação nem migração automática.

A duplicação copia a receita selecionada e apenas imports referenciados, lendo/verificando seus hashes; os inputs históricos aprovados são copiados pelo inicializador existente. Nunca usa symlink/hardlink. Não copia todas as versões ou recursos soltos do original. O registo `project.json` conserva origem, hash da receita de origem e hashes dos imports; não é autorização para publicação. Arquivos são criados exclusivamente, sem overwrite. Uma falha de I/O pode deixar um destino parcial reservado, que não entra na lista sem registo completo; escolher outro identificador e preservar o parcial para inspeção, sem limpeza automática.

Ao trocar ou criar projeto com alterações pendentes: **Guardar e continuar** exige nome novo e receita válida no projeto atual; **Descartar e continuar** abandona só o editor; **Cancelar**/Escape mantém o projeto e devolve foco ao botão. Um PNG selecionado mas não confirmado não é importado por essa ação. A gravação inválida/colisão mantém o diálogo aberto e permite corrigir ou cancelar. O ponto de partida é imutável: para continuar uma edição guardada, escolher sua receita/revisão na lista, não presumir que o ponto de partida foi sobrescrito.

As prévias já abertas continuam vinculadas ao projeto/revisão original. Trocar projeto não troca o conteúdo dessas janelas; a paragem da bancada encerra todos os seus servidores próprios. Não abrir duas sessões sobre a mesma pasta de projetos, nem copiar/mover diretórios enquanto houver sessão ativa. Portabilidade: parar, copiar a raiz inteira incluindo `projects`, `library`, `recipes` e `revisions`, iniciar a ferramenta na cópia. Verificação/publicação continuam separadas; publicação é sempre proibida nesta bancada.
