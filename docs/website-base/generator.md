# Referências executáveis32 — configuração para saída estática local

O gerador substitui a demonstração apenas narrativa por duas referências reais.
São identidades sintéticas, com noindex/nofollow e origins example.invalid. Não
inclui clientes reais, adaptação operacional de31 ou autorização de publicação.

## Execução

Com Node existente e este repositório Git completo (sem downloads):

```powershell
node --test tests/website-base-generator.test.mjs
node fixtures/website-base/generate.mjs fixtures/website-base/cedro.json C:/pasta-existente/cedro
node fixtures/website-base/generate.mjs fixtures/website-base/linha.json C:/pasta-existente/linha
$env:WEBSITE_PLAYWRIGHT_ROOT = 'C:/worktree-com-playwright-1.62.0-instalado'
node tests/website-base-browser.mjs C:/pasta-existente C:/outra-pasta-existente/qa-novo
```

Destinos devem ser novos; pais já existentes, sem links/junctions. Não sobrescreve,
não apaga e não escreve em ficheiros de outro projeto. A validação acontece antes
de reservar o diretório. Falha I/O depois da reserva pode deixar diretório parcial;
não é uma saída válida sem manifesto final e não é limpo automaticamente.
O gerador pressupõe processo e filesystem locais confiáveis; não é isolamento de
SO contra outro processo que modifique diretórios concorrentemente.

## Configuração realmente consumida

version1,synthetic=true,id,name,mark,origin example.invalid,locale pt-PT;
palette(bg/surface/ink/accent);fonts(body/display:manrope ou bricolage);
heroAsset(workspace ou none);eyebrow,headline,description,imageAlt/imageCaption,
approachTitle,três steps,contactTitle/contactText;navigation(home/approach/contact/
open/close). Todos obrigatórios, campos extras rejeitados. Valores de texto são
encodados; CSS aceita só hex e famílias fechadas. Não recebe URLs de assets,
scripts, instaladores, paths de template, endpoints ou código de cliente.

Saída: index.html,contacto.html,CSS/JS locais,logo de iniciais,fontes e imagem
conhecidas,robots/sitemap e manifesto de hashes. Os dois HTML não enviam dados.
JSON-LD Organization usa nome/descrição visíveis; não inventa autores,depoimentos,
serviços em produção,estatísticas,ratings ou promessa SEO/GEO. Origins e sitemap
são forma estrutural para adoção, deliberadamente não indexáveis nesta demo.

## Origem comum e exclusões

Origem histórica31:2160bb4baac5d0c3cb388a9ec39eea99ee5dcb68.
Na candidata35 essa origem não é dependência de execução: não precisa ser publicada
nem estar presente no clone. `fixtures/website-base/provenance.json` preserva a
origem e os hashes aprovados. A âncora pública dos assets é a main existente
851c1723119b62193623fa24e67090afd18b39f1, com lazy-fetch desativado:

- fixtures/website-base/navigation.js: componente já extraído/aprovado32, agora
  autocontido, byte-idêntico à saída32. Não lê branct.js vivo. Nenhum boot,Pixel,
  i18n,formulário,webhook ou storage. Adaptação32: fechar no desktop901px.
- Links da composição32 recebem tabindex0 explícito. O WebKit local ignora
  anchors sem esse atributo na navegação Tab padrão; o ensaio mínimo e o QA
  completo preservam a mesma expectativa de alcançar link de salto e menu.
- src/fonts/manrope-latin.woff2 e bricolage-grotesque-latin.woff2: fontes já
  disponíveis; redistribuição futura precisa conferir licença no projeto.
- src/img/website-940.webp: imagem ilustrativa existente, jamais prova de cliente.
- src/css/branct.css: vocabulário/reset/tokens/hierarquia/targets/reduced-motion
  e componentes reutilizados seletivamente em fixtures/website-base/site.css,
  sem copiar CSS institucional inteiro ou esconder overflow.

Permanecem específicos da BRANCT e NÃO são emitidos: todas as páginas originais,
branct.js completo,trial.js,legal,dicionários,marca/logos,integrações,consentimento,
CRM,tracking,.htaccess,deploy e manifesto de publicação. Não existe simples flag
DISABLED sobre código operacional: os adaptadores estão ausentes da saída.

## Fronteira e adoção

Duas identidades demonstram configuração, não todo tipo de projeto/idioma.
O catálogo de componentes informa o desenho; não adicionamos pricing,loja,FAQ,
logos de clientes ou 3D sem conteúdo/necessidade. Contato é só navegação local.
QA32 é novo e ligado ao32; não herda screenshots nem números26/30. Contraste,
targets,foco,overflow e metadados medidos localmente não garantem WCAG integral,
Core Web Vitals,Lighthouse,indexação,preview servido ou citações em IA.

O WebKit/Playwright local injeta style body{} durante a captura. Um fixture
sem scripts reproduziu a violação de CSP apenas ao fotografar. O QA registra
essa mensagem exata na fase de captura em toolingDiagnostics; não altera CSP
nem aceita outros erros da página. Firefox que falha antes de newPage fica
NOT_VERIFIED e não impede concluir as combinações dos outros motores.

Para adoção real: autoridade de conteúdo/marca,assets/fontes e política de URLs
devem ser aprovadas, seguida de validação/publicação própria. Gerador32 mantém
synthetic-only; evolução para clientes não é uma flag oculta. Integração futura
do acumulado26/31 em main toca HTML/CSS/JS e pode disparar FTP; por isso35 seleciona
apenas o pacote offline e não integra essa cadeia. O workflow35 é novo e local,
sem alteração dos gates/deploy existentes; publicação/CI dependem de autorização.
