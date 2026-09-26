# WEBSITE38 — criar projetos locais por receita

Este fluxo cria uma prévia BRANCT utilizável a partir da base reutilizável. A receita define marca, conteúdo, paleta, fontes, assets e nomes das duas rotas; não é necessário editar JavaScript por marca nem copiar a aplicação inteira para cada projeto. A saída tem 14 ficheiros estáticos. Continua a ser um rascunho local, sem publicação, formulário ou integrações.

## Usar a entrega

Checkout local desta entrega:

`C:/Users/geral/Documents/Codex/internas-entrega-20260926/website38/worktree`

Receita BRANCT: `fixtures/website-project/branct.json`.

Saída final: `C:/Users/geral/Documents/Codex/internas-entrega-20260926/website38/preview-final`.

Prévia iniciada em 26/09/2026: `http://127.0.0.1:50866/index.html`. A URL é local à máquina. O estado do processo está em `../preview-process.json`; uma nova execução escolhe outra porta livre. Um registo antigo não prova que o processo permanece ativo.

Requisito: Node já instalado; PowerShell para os helpers de início/parada em Windows. O gerador/verificador não instala dependências nem consulta a rede. Os recursos partilhados e fontes devem continuar disponíveis no checkout da ferramenta; cada nova saída contém só os recursos que utiliza.

Na raiz do checkout, este comando **gera e verifica** outro destino novo:

```powershell
node fixtures/website-project/project.mjs create fixtures/website-project/branct.json C:/Users/geral/Documents/Codex/internas-entrega-20260926/website38/outro-projeto
```

Para validar de novo a entrega existente, sem escrever:

```powershell
node fixtures/website-project/project.mjs verify fixtures/website-project/branct.json C:/Users/geral/Documents/Codex/internas-entrega-20260926/website38/preview-final
```

`PASS` aqui significa reconstrução e comparação exata dos bytes com a receita e os recursos locais atuais. Não significa QA de browser, aprovação de copy, direitos de redistribuição ou publicação. O verificador não confia num manifesto alterado para aceitar ficheiros alterados.

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
| `fixtures/website-base/site.css` | Mesmos bytes: layout editorial, header/nav, hero, lista, convite, rodapé, breakpoints e foco. |
| `fixtures/website-base/navigation.js` | Mesmos bytes: drawer, Escape, overlay, foco inicial/trap/retorno, inert e scroll lock. |
| `fixtures/website-project/project.mjs` | Novo validador e template de rascunho, metadados coerentes, saída exclusiva, manifesto e rebuild-verification. |
| `fixtures/website-base/generate.mjs`, Cedro/Linha | Intocados. `synthetic=true`, `.invalid`, matriz histórica e recusas originais permanecem. A38 não chama nem relaxa o validador37. |
| `src/fonts/*` | Fontes existentes copiadas para a saída; escolhas da receita usam tokens do layout comum. |

O novo template preserva a composição da base37; substitui a identidade sintética por conteúdo do projeto, permite nomes de rota e assets configuráveis e mantém indicadores explícitos de rascunho. A adaptação CSS limita-se aos tokens, fontes, quebra segura de texto e imagem inteira no frame. Nenhuma página viva, `branct.js`, workflow, proteção ou payload de deploy foi alterado.

## Fontes BRANCT utilizadas

- `CLAUDE.md`: paleta Premium Light 2026 (`#FAFAF9`, `#FFFFFF`, `#0D1B24`, `#0C7C8F`) e fontes Manrope/Bricolage.
- `website-premium.html`: título/aria-label “Websites Premium”.
- `src/i18n/pt.json`: `wp.hero.eyebrow`, `wp.sheet.sub`, `wp.sheet.title`, `wp.sheet.c1.title`, `wp.sheet.c2.title`, `wp.sheet.c3.title`, `ct.hero.title`, `ct.form.message` sem o asterisco de campo obrigatório.
- `index.html`: nome BRANCT.Tech e origem canonical `https://branct.com`.
- `src/img/icon.svg` e `src/img/website-940.webp`: bytes existentes, sem alteração. Alt e legenda descrevem a ilustração observada; não alegam projeto de cliente.
- `src/fonts/font-faces.css` e quatro `.woff2`: famílias e subsets locais.

Não foram criados clientes, preços, testemunhos, traduções, resultados de campanha ou capacidades de CRM. O contacto é uma página informativa de rascunho. Não envia mensagens nem abre canais reais.

## SEO/GEO e limites

Cada rota tem título/descrição derivados do conteúdo visível, canonical por rota, Open Graph/Twitter coerentes e JSON-LD `WebPage` com nome, descrição, idioma, URL e referência à organização pelo nome. Não há ratings, FAQ, serviços operacionais ou provas sociais inventados.

Todas as páginas recebem `noindex, nofollow, noarchive`, `robots.txt` bloqueia `/`, sitemap é vazio e o servidor local adiciona `X-Robots-Tag`. Um domínio real na receita não desativa qualquer bloqueio. Não existe operação de deploy/publicação nesta ferramenta. Metadados estruturados não garantem ranking, indexação ou recomendações por IA.

## Preview com ciclo de vida seguro

Iniciar, a partir da raiz do checkout, com um registo novo:

```powershell
./fixtures/website-project/start-preview.ps1 -Recipe ./fixtures/website-project/branct.json -Destination ../preview-final -Record ../preview-nova.json
```

O helper inicia Node com janela oculta, ligado apenas a `127.0.0.1`, escolhe uma porta livre e retorna o URL. Guarda PID, data, porta, destino, script e logs. Nunca substitui registos existentes. O servidor só serve recursos da saída verificada, aceita GET/HEAD e não serve o código/manifesto do projeto.

Para encerrar **esta entrega**:

```powershell
./fixtures/website-project/stop-preview.ps1 -Record ../preview-process.json
```

O helper confirma missão, host, caminho do script/registo, PID, comando e data de criação do processo antes de parar. Não encerra por porta nem por nome genérico do processo. PID reutilizado ou comando diferente causa recusa. Foi provado com duas previews próprias: uma parou e a outra continuou HTTP200.

Em outras plataformas, executar `node fixtures/website-project/preview.mjs RECEITA DESTINO REGISTRO_ABSOLUTO_NOVO` em terminal próprio e terminar esse processo com Ctrl+C.

## Provas e limitações medidas

- 32/32 testes novos: criação real, dois destinos independentes, rotas customizadas, revisão sem overwrite, bundle externo, escaping, entradas/assets inválidos, symlink/junction, adulteração mesmo com manifesto reescrito, CLI e servidor.
- 30/30 casos novos: BRANCT × duas rotas × cinco viewports × Chromium/Firefox/WebKit, Playwright local já instalado 1.62.1. Viewports: 360×800, 390×844, 768×1024, 1024×768, 1440×900.
- 21 capturas em `qa-v3`; leitura visual de home desktop/tablet/mobile, contacto e drawer por executor e coordenação. Zero erros de página/HTTP, zero tentativas externas; assets, fontes, links/âncoras, overflow, alvos44px, skip-link, foco, menu e metadados passaram.
- A primeira medição encontrou foco de links em WebKit; a correção `tabindex=0` ficou somente no novo template. Avisos de CSP do screenshotter WebKit permanecem identificados como `toolingDiagnostics`, segundo o contrato já existente; não foram ocultados como erros da aplicação.
- `preview-final` preserva os bytes37 com LF. A diferença face à versão medida `preview-v3` limita-se a CRLF→LF em CSS/JS herdados e hashes derivados do manifesto. `EQUIVALENCIA-QA.json` prova igualdade de todos os recursos após normalização de EOL; a saída final passou rebuild-verification. Não foi repetida uma campanha de browser por essa mudança sem semântica.
- As provas históricas37 (72/72, 36 capturas, PR68/ce51) continuam separadas. `PRESERVACAO37.json` regista os hashes idênticos; não houve campanhaCI, push, PR nova, merge ou publicação.

Não foram medidos Lighthouse, Core Web Vitals, hardware móvel/Safari real, auditoria WCAG completa, leitor de ecrã, rede pública ou indexação. Esses limites não são PASS. O navegador integrado falhou antes de conectar por Windows1344; o MCP Playwright estava com perfil em uso. O ensaio executado utilizou browsers headless próprios, já instalados, sem alterar perfis ou permissões globais.

## Passagem

Entrega local encerrável pelo resultado, receita, saída, commit/diff e provas. Próxima decisão humana concreta: avaliar se e como integrar este fluxo local no repositório partilhado. Publicação de site, conteúdos comerciais completos, idiomas adicionais, formulários/CRM, direitos de redistribuição e produção exigem escopo e autorização próprios. Nada aqui publica um segundo site vivo.
