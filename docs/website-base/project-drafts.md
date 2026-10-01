# Criar projetos locais por receita — base reutilizável

Este fluxo cria uma prévia BRANCT utilizável a partir da base reutilizável. A receita define marca, conteúdo, paleta, fontes, assets e nomes das duas rotas; não é necessário editar JavaScript por marca nem copiar a aplicação inteira para cada projeto. A saída tem 14 ficheiros estáticos. Continua a ser um rascunho local, sem publicação, formulário ou integrações.

## Usar a entrega

Usar um checkout Git da candidata que contém este guia. Não é necessário obter pastas de missão, provas privadas ou saídas de outro computador. A receita BRANCT é `fixtures/website-project/branct.json`; todos os seus recursos e fontes estão versionados. A saída gerada é autónoma e não precisa do repositório para ser servida estaticamente.

Requisito: Node já instalado; PowerShell para os helpers de início/parada em Windows. O gerador/verificador não instala dependências nem consulta a rede. Os recursos partilhados e fontes devem continuar disponíveis no checkout da ferramenta; cada nova saída contém só os recursos que utiliza.

Na raiz do checkout, este comando PowerShell **gera e verifica** um destino novo ao lado do repositório (sem caminhos pessoais):

```powershell
node fixtures/website-project/project.mjs create fixtures/website-project/branct.json "$((Get-Item ..).FullName)/branct-draft-v1"
```

Para validar de novo a entrega existente, sem escrever:

```powershell
node fixtures/website-project/project.mjs verify fixtures/website-project/branct.json "$((Get-Item ..).FullName)/branct-draft-v1"
```

`PASS` aqui significa reconstrução e comparação exata dos bytes com a receita e os recursos locais atuais. Não significa QA de browser, aprovação de copy, direitos de redistribuição ou publicação. O verificador não confia num manifesto alterado para aceitar ficheiros alterados.

Num shell POSIX, o destino equivalente é `"$(cd .. && pwd)/branct-draft-v1"`. Resolver o pai primeiro: o contrato recusa segmentos `..` no destino. O pai deve existir e o destino não pode existir. Para outra revisão, escolher `branct-draft-v2`.

CSS, JavaScript e SVG gerados usam LF canónico, independentemente do EOL do checkout. Não são normalizados espaços, conteúdo nem recursos binários. A comparação do destino continua byte a byte: adulterações não são normalizadas pelo verificador. Isto torna a saída e o manifesto idênticos em receptores LF/CRLF. Os recursos originais da base e do site não são modificados.

## Criar outra marca ou revisão

1. Copiar apenas a receita JSON para uma pasta de trabalho própria.
2. Alterar os campos de identidade, conteúdo, rotas e os caminhos dos assets existentes. `assets.root` resolve relativamente à pasta da receita e pode apontar para um pequeno bundle externo local. Os caminhos de `logo`, `hero` e `sources[].path` são relativos a essa raiz. O teste do bundle externo prova este percurso sem copiar toda a aplicação.
3. Guardar logo, imagem e documentos de origem dentro dessa raiz. `sources` regista proveniência declarada e exige ficheiros existentes; não concede aprovação humana, direitos ou comprovação comercial automática.
4. Executar `create RECEITA DESTINO_NOVO` com o mesmo `project.mjs`. A pasta-pai deve existir. O nome do destino aceita letras minúsculas, números e hífen.
5. Observar a prévia nos viewports relevantes. Uma marca diferente pode ter texto/imagem com proporções diferentes; o QA desta BRANCT não aprova todas as receitas futuras.

Para atualizar, gerar numa pasta de nova revisão. Destinos existentes, incluindo pastas vazias, são recusados. Não existe `--force`, limpeza automática ou atualização destrutiva. Guardar a revisão anterior e, após verificar a nova, iniciar uma prévia com novo registo. Uma falha de I/O pode deixar saída parcial: não a tratar como válida nem apagá-la automaticamente; escolher outro destino após investigar.

## Contrato da receita

Todos os campos do exemplo são obrigatórios; campos extra são recusados com o caminho do erro.

| Campo | Contrato |
| --- | --- |
| `version`, `kind` | `1`, `local-draft`. Nenhum modo de produção. |
| `id`, `name` | Identificador portátil de 2–36 caracteres; nome visível até 48 caracteres. |
| `origin` | Origem HTTPS, sem porta, caminho, query ou credenciais. Aceita domínio real, mas não altera bloqueios de rascunho. |
| `locale` | Apenas `pt-PT` nesta versão. Não cria traduções, seletor de idioma ou hreflang. Os textos PT/EN/IT/HR da aplicação viva não são automaticamente transportados. |
| `palette` | `bg`, `surface`, `ink`, `accent`, cores de seis dígitos. Contraste mínimo 4.5:1 entre ink/accent e bg/surface. |
| `fonts` | Corpo e display: `manrope` ou `bricolage`, com subsets latin e latin-ext locais. |
| `assets` | Raiz local; logo SVG estático restrito ou PNG/JPEG/WebP; hero PNG/JPEG/WebP; alt e legenda não vazios. Máximo 5 MB por recurso. Sem caminhos de travessia, links simbólicos ou junctions. |
| `routes` | Duas páginas, `home` e `contact`, nomes `.html` planos e distintos; todos os links são construídos a partir destes nomes. |
| `content` | Eyebrow, headline, descrição, título da abordagem, 1–6 passos, título e texto do contacto. Textos até 600 caracteres, passos até 160. Texto é escapado; não é HTML nem código executável. |
| `navigation` | Home/approach/contact/open/close, até 32 caracteres. |
| `sources` | Lista de documentos/assets existentes e nota explicativa. Proveniência declarada pelo operador. |

Erros relevantes identificam o campo: `content.headline: campo obrigatório ausente`, `assets.hero: ficheiro inexistente`, `routes: home e contact devem ser diferentes`, `destino já existe`. Um dado essencial ausente é recusado; não é completado por invenção.

O ícone SVG é tratado como recurso estático, com subset restrito de elementos e recusa de script, atributos de evento, estilos, entidades, links e conteúdo embutido. O fluxo é uma ferramenta local de desenvolvimento com receitas/recursos confiáveis; não é um sandbox para processar uploads hostis.

## O que é reutilizado e o que fica separado

| Contrato | Uso na38 |
| --- | --- |
| `fixtures/website-base/site.css` | Mesmo conteúdo, com EOL canónico na saída: layout editorial, header/nav, hero, lista, convite, rodapé, breakpoints e foco. |
| `fixtures/website-base/navigation.js` | Mesmo conteúdo, com EOL canónico na saída: drawer, Escape, overlay, foco inicial/trap/retorno, inert e scroll lock. |
| `fixtures/website-project/project.mjs` | Novo validador e template de rascunho, metadados coerentes, saída exclusiva, manifesto e rebuild-verification. |
| `fixtures/website-base/generate.mjs`, Cedro/Linha | Intocados. `synthetic=true`, `.invalid`, matriz histórica e recusas originais permanecem. A38 não chama nem relaxa o validador37. |
| `src/fonts/*` | Fontes existentes copiadas para a saída; escolhas da receita usam tokens do layout comum. |

O novo template preserva a composição da base37; substitui a identidade sintética por conteúdo do projeto, permite nomes de rota e assets configuráveis e mantém indicadores explícitos de rascunho. A adaptação CSS limita-se aos tokens, fontes, quebra segura de texto e imagem inteira no frame. Nenhuma página viva, `branct.js`, proteção ou payload de deploy foi alterado. A WEBSITE40 acrescenta validação do projeto ao workflow de referências existente, sem modificar os gates protegidos.

## Fontes BRANCT utilizadas

- `CLAUDE.md`: paleta Premium Light 2026 (`#FAFAF9`, `#FFFFFF`, `#0D1B24`, `#0C7C8F`) e fontes Manrope/Bricolage.
- `website-premium.html`: título/aria-label “Websites Premium”.
- `src/i18n/pt.json`: `wp.hero.eyebrow`, `wp.sheet.sub`, `wp.sheet.title`, `wp.sheet.c1.title`, `wp.sheet.c2.title`, `wp.sheet.c3.title`, `ct.hero.title`, `ct.form.message` sem o asterisco de campo obrigatório.
- `index.html`: nome BRANCT.Tech e origem canonical `https://branct.com`.
- `src/img/icon.svg` e `src/img/website-940.webp`: recursos existentes, sem alteração dos originais; apenas EOL do SVG é canonizado na saída. Alt e legenda descrevem a ilustração observada; não alegam projeto de cliente.
- `src/fonts/font-faces.css` e quatro `.woff2`: famílias e subsets locais.

Não foram criados clientes, preços, testemunhos, traduções, resultados de campanha ou capacidades de CRM. O contacto é uma página informativa de rascunho. Não envia mensagens nem abre canais reais.

## SEO/GEO e limites

Cada rota tem título/descrição derivados do conteúdo visível, canonical por rota, Open Graph/Twitter coerentes e JSON-LD `WebPage` com nome, descrição, idioma, URL e referência à organização pelo nome. Não há ratings, FAQ, serviços operacionais ou provas sociais inventados.

Todas as páginas recebem `noindex, nofollow, noarchive`, `robots.txt` bloqueia `/`, sitemap é vazio e o servidor local adiciona `X-Robots-Tag`. Um domínio real na receita não desativa qualquer bloqueio. Não existe operação de deploy/publicação nesta ferramenta. Metadados estruturados não garantem ranking, indexação ou recomendações por IA.

## Preview com ciclo de vida seguro

Iniciar, a partir da raiz do checkout, com um registo novo:

```powershell
./fixtures/website-project/start-preview.ps1 -Recipe ./fixtures/website-project/branct.json -Destination ../branct-draft-v1 -Record ../branct-preview-v1.json
```

O helper inicia Node com janela oculta, ligado apenas a `127.0.0.1`, escolhe uma porta livre e retorna o URL. Guarda PID, data, porta, destino, script e logs. Nunca substitui registos existentes. O servidor só serve recursos da saída verificada, aceita GET/HEAD e não serve o código/manifesto do projeto.

Usar o URL devolvido pelo comando; a porta é escolhida no próprio computador. Para encerrar **apenas essa prévia**:

```powershell
./fixtures/website-project/stop-preview.ps1 -Record ../branct-preview-v1.json
```

O helper confirma missão, host, caminho do script/registo, PID, comando e data de criação do processo antes de parar. Não encerra por porta nem por nome genérico do processo. PID reutilizado ou comando diferente causa recusa. Foi provado com duas previews próprias: uma parou e a outra continuou HTTP200.

Em outras plataformas, executar `node fixtures/website-project/preview.mjs RECEITA DESTINO REGISTRO_ABSOLUTO_NOVO` em terminal próprio e terminar esse processo com Ctrl+C.

## Verificação reproduzível e limites

```powershell
node --test tests/website-project.test.mjs
```

Os 33 testes cobrem criação real, dois destinos, revisão sem overwrite, bundle externo, entradas/assets inválidos, escaping, ligação simbólica/junction, adulteração mesmo com manifesto reescrito, CLI, servidor e receptores sem Git/dependências com EOL LF/CRLF. Não é necessário instalar npm para gerar, verificar ou executar estes contratos.

A aceitação WEBSITE38 registou 30/30 casos BRANCT (duas rotas × cinco viewports × três engines) e 21 capturas, com Playwright local 1.62.1. Viewports: 360×800, 390×844, 768×1024, 1024×768, 1440×900. É evidência histórica, não CI deste incremento. A WEBSITE39 conserva o template e demonstra equivalência textual dos recursos após canonização de EOL; não repete a campanha visual. As provas sintéticas WEBSITE37 (72/72, 36 capturas, PR68/ce51acd) permanecem separadas e não aprovam automaticamente qualquer nova receita.

O harness opcional `tests/website-project-browser.mjs` recebe receita, saída, pasta nova de evidências e raiz de um Playwright já instalado; não instala browsers. Não é requisito do comando create/verify nem motivo para copiar um ambiente privado.

### Validação automática preparada na WEBSITE40

O workflow existente `Website base reference validation` passa a selecionar também os cinco ficheiros exatos de `fixtures/website-project` e os dois testes `website-project`, sem wildcard novo. Uma mudança apenas da receita ou do teste seleciona a mesma campanha. Continuam apenas os eventos PR `opened`/`synchronize`, uma tentativa por head, um job e o limite de 20 minutos. Permissões read, checkout do SHA da PR, imagem por digest e downloads de browsers desativados permanecem inalterados.

O passo de contratos inclui agora os 33 testes de projeto e as regressões de seleção, propagação de falha e receptor Git da WEBSITE40. Depois, `fixtures/website-base/verify-project-receiver.mjs` lê do SHA exato os 15 blobs regulares do conjunto fechado necessário à receita BRANCT, materializa um receptor sem `.git`/`node_modules`, executa os comandos existentes `create` e `verify` e exige os 14 ficheiros. Não usa resultados locais ou pastas privadas como entrada. Os paths deste conjunto são específicos da receita BRANCT; mudar suas dependências exige rever o conjunto, não procurar ficheiros externos automaticamente.

`project-receiver/receipt.json`, incluído no artefacto do job já existente, regista head, plataforma, Node, contexto LOCAL/GITHUB_ACTIONS, blobs/digests de origem, comandos, códigos de saída e hashes da saída. Uma falha do teste ou do receptor falha o passo e impede a medição posterior; não há `continue-on-error`. O recibo é prova de reconstrução estática, não aprovação visual. O CI executará ainda **uma só** campanha histórica Cedro/Linha de 72 casos; não foi adicionada uma segunda campanha BRANCT nem aumentado o timeout.

Para repetir apenas o receptor numa revisão já commitada, usar Node e Git, numa pasta de evidências nova e fora do checkout:

```powershell
node fixtures/website-base/verify-project-receiver.mjs (Get-Location).Path (git rev-parse HEAD) "$((Get-Item ..).FullName)/project-receiver-v1"
```

Uma execução local permanece identificada como LOCAL e não comprova Linux/GitHub Actions. Os testes de CI usam Bash (Git Bash em Windows) para executar de verdade os comandos do workflow com fixtures isoladas, incluindo o caminho de erro. Não lançam browsers nem instalam dependências. A publicação e os resultados do CI no novo head continuam dependentes do ciclo remoto posterior; configuração testada localmente não equivale a run remoto concluído.

Não foram medidos nesta entrega Lighthouse, Core Web Vitals, hardware móvel/Safari real, auditoria WCAG completa, leitor de ecrã, rede pública ou indexação. Não é um sandbox para uploads hostis; receitas e assets são entradas locais confiáveis. Testes técnicos e proveniência declarada não substituem revisão humana, direitos de utilização ou autorização de publicação.

## Passagem

Entrega local encerrável pelo resultado, receita, saída, commit/diff e provas. Próxima decisão humana concreta: avaliar se e como integrar este fluxo local no repositório partilhado. Publicação de site, conteúdos comerciais completos, idiomas adicionais, formulários/CRM, direitos de redistribuição e produção exigem escopo e autorização próprios. Nada aqui publica um segundo site vivo.
