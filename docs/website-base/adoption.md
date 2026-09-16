# Base Website — adoção incremental, sem copiar identidade

Estado: candidato local de referência. Não é BASE_WEBSITE_ACEITA, template de publicação automática nem autorização de release. A implementação BRANCT é a referência; e-commerce e 3D não integram esta entrega.

## Fontes e separação

Este candidato parte de main851c1723119b62193623fa24e67090afd18b39f1. Os quatro ficheiros funcionais vêm do candidato revisto563f3c13665347b2a8578110e519ebaf13f356e8: crm-gestao.html, politica-privacidade.html, src/css/branct.css, src/js/branct.js. Não foram transportados os contratos protegidos de transição dessa branch antiga. A alteração adicional26 torna o nome acessível do botão de fechar configurável por atributo, mantendo o padrão português e os botões existentes.

O catálogo constitucional continua em docs/audit/phase-2/component-catalog.md; tokens e estados estão em f2-00-contract.json. Itens target-only/NOT_VERIFIED não viram componentes implementados por esta documentação. A aplicação de referência continua estática, HTML/CSS/JS, sem novo framework, build ou dependência.

| Camada | Reutilizar | Configurar por cliente / não transportar automaticamente |
| --- | --- | --- |
| Navegação | setupDrawer; contrato de teclado, Escape, foco, inert e scroll lock; classes mobile-toggle/mobile-drawer/drawer-overlay | Rotas, texto, logo, CTA, profundidade, língua, aria-controls e nomes acessíveis |
| Layout e controlos | Camadas reset/layout/components; grids fluidos, targets44×44, foco e reduced-motion | Densidade editorial, hierarquia, proporções e composição da página |
| Tokens | Papéis --bg/--surface/--ink/--line/--accent e escalas existentes | Valores de cores, contrastes reais, raio, espaçamento, movimento; não converter teal/ink em identidade universal |
| Tipografia | Hierarquia e estratégia local de carregamento | Fontes licenciadas do cliente, @font-face, famílias body/headings/logo e métricas. BRANCT usa Manrope/Bricolage; não copiar essas escolhas por defeito |
| Conteúdo | Semântica, landmarks, estrutura de estados, revisão anti-template | Copy, imagens, números, produtos, preços, prova social, contactos e contexto legal aprovados |
| Integrações | Contrato de sucesso/erro/carregamento e consentimento a validar | Nenhum endpoint, Pixel ID, identificador de storage, webhook, credencial pública histórica, CRM ou signup da BRANCT deve ser herdado |
| Qualidade | Checklist de adaptação e testes comportamentais proporcionais | Matriz de rotas/idiomas, breakpoints, evidência e aceite por projeto |

## Ponto de configuração implementado

O drawer pode declarar `data-close-label="Close navigation"`. O controlador lê esse texto quando precisa criar o botão interno. Ausência ou espaços vazios conservam `Fechar menu`; o valor é usado apenas como atributo ARIA, nunca como HTML. Se a página já fornece `.drawer-close`, o controlador preserva seu nome e conteúdo. Tradução dinâmica deve pertencer ao mecanismo de i18n do cliente; o atributo não promete reatividade após inicialização.

Exemplo estrutural mínimo, sem URLs externas:

```html
<button class="mobile-toggle" aria-controls="client-nav" aria-label="Open navigation">Menu</button>
<nav id="client-nav" class="mobile-drawer" data-close-label="Close navigation">
  <a href="about.html">About</a>
</nav>
<div class="drawer-overlay" aria-hidden="true"></div>
<main>Client content</main>
<footer class="footer">Client legal and contact links</footer>
```

O desenho atual pressupõe um drawer e um acionador por documento, um backdrop, landmarks main/footer e consentimento identificado por `.consent`. Não é gerenciador genérico de modais aninhados, múltiplos drawers, shadow DOM ou aplicações SPA. Esses casos exigem escopo e testes próprios. Na landing CRM o controlador equivalente permanece inline; não unificá-lo por refactor silencioso.

## Configuração demonstrada — não configuração operacional

fixtures/website-base/client-synthetic.json contém somente identidade sintética, cores, fonte de sistema e integrationMode DISABLED. O teste tests/website-base-config.test.mjs aplica esses valores numa página controlada e executa o boot real. Comprova que texto, cor, fonte e nome acessível não são substituídos pelo comportamento do drawer. Também testa o controlador inline CRM. O JSON não é lido por páginas publicadas e não liga integrações.

Para reproduzir com o Playwright1.62.0 já instalado, sem download:

```powershell
$env:WEBSITE_PLAYWRIGHT_ROOT = 'C:/caminho/da/worktree/com/dependencias-existentes'
$env:WEBSITE_ENGINES = 'chromium,firefox,webkit'
$env:WEBSITE_REPORT = 'C:/caminho/de/evidencia/identidade.json'
node --test tests/website-base-config.test.mjs
```

Não executar npm install, npx com download ou playwright install sob a autorização26. Motor ausente/erro ao criar página não conta como PASS. O teste é focal, não substitui a matriz canônica84/41/184, avaliação visual global, WCAG ou performance.

## Projeto novo — sequência curta

1. Confirmar repositório/ambiente, briefing, dono e fontes aprovadas de marca, copy, rotas, fontes licenciadas e imagens. Fixar baseline e componentes realmente necessários.
2. Usar o catálogo como vocabulário, não copiar todas as secções BRANCT. Extrair apenas o controlador e os estilos necessários; não importar branct.js completo como biblioteca de outro cliente, pois contém boot e integrações específicas da referência.
3. Fornecer HTML semântico e rótulos do cliente; configurar tokens e fontes locais. Conferir contrastes e targets com conteúdo real. Nenhum outro cliente foi alterado ou migrado nesta missão.
4. Integrar primeiro em ambiente local sem endpoints operacionais. Definir política de consentimento e storage própria. Não copiar valores de tracking ou webhook; testes e demos não submetem dados.
5. Executar navegação por teclado, foco, abertura/fechos, overflow e touch targets na matriz do projeto. Medir engines de fato disponíveis e guardar causa das inconclusões.
6. Validar conteúdo/SEO/contraste/performance e estados aplicáveis; obter revisão e aprovação vinculadas ao candidato. Definir publicação e rollback próprios, nunca herdar autorização do site BRANCT.

## Projeto existente — adoção sem migração em lote

1. Fotografar árvore, componentes, contratos e evidências existentes. Comparar necessidade com o catálogo.
2. Reservar um componente/defeito e seus ficheiros em branch isolada. Não substituir marca, design tokens, copy ou integrações.
3. Escrever RED do defeito e adaptar o menor comportamento (por exemplo, o drawer), preservando DOM/ARIA/estados do projeto; se a estrutura não é compatível, pedir decisão antes de importar o módulo.
4. Fazer GREEN e regressões nas páginas consumidoras. Inspecionar antes/depois; regressão ou engine não medida bloqueia o aceite correspondente.
5. Entregar patch, origem, resultados, riscos e rollback. Merge de ficheiros publicados pode acionar deploy; tratar release em autorização distinta.

## Critérios do aceite da referência

O contrato F2-01 executável mais recente usa12 rotas×7 viewports=84 observações,41 identidades e184 ações. A especificação narrativa anterior lista cinco viewports/60 observações; os dois escopos não são intercambiáveis. Aceite final exige relatório completo pelas regras vigentes, não apenas QA focal home/CRM.

- Zero overflow e targets inválidos nas dimensões contratadas; não esconder conteúdo para simular correção.
- Foco visível, operação de teclado, aria-expanded, inert, scroll lock e fecho por Escape/botão/backdrop.
- Reduced-motion preservando conteúdo e interação; narrativa/marca intactas.
- Relatórios íntegros e vinculados à árvore candidata; timeout/ausência de motor continuam inconclusivos.
- Engines e QA visual obrigatórios realmente executados; contrastes contextualizados, WCAG/performance não inferidos de CSS.
- Aprovação formal e processo protegido, seguidos de decisão de release própria para ficheiros vivos.

O pacote26 registra exatamente quais desses critérios têm prova histórica, nova prova focal ou lacuna. Não fabricar READY/INTEGRATED nos contratos protegidos e não reutilizar aprovação de outra PR.

## SEO técnico e GEO — quatro níveis distintos de aceite

1. **Competência disponível:** as skills BRANCT SEO e ai-seo estão instaladas. Isso comprova disponibilidade de método, não implementação nem resultado de um site.
2. **Implementação por projeto:** conferir títulos e descrições específicos, canonical, headings/landmarks, links rastreáveis, idioma, sitemap e robots, conteúdo textual útil e dados estruturados válidos e coerentes com o que a página mostra. O inventário local do pacote26 registra presença/sintaxe; não certifica veracidade editorial, indexação ou elegibilidade para rich results.
3. **Publicação:** conferir depois de release autorizado HTTP, canonical no domínio certo, redirects, diretivas, CDN e conteúdo servido. Nesta missão não houve acesso à produção, mudança de robots, sitemap, metadados ou JSON-LD.
4. **Visibilidade medida:** somente resultados coletados com método e amostra declarados permitem falar de indexação, citações, menções ou conversões. Nenhuma consulta paga, campanha, Search Console/analytics ou medição de citações foi realizada. Estado: NOT_VERIFIED.

Checklist por cliente, antes do aceite editorial/técnico:

- Confirmar entidade/organização, autores quando aplicável, responsabilidade pelo conteúdo, contactos e fontes de alegações; não transportar a entidade BRANCT para outra marca.
- Escrever para pessoas, com informação verificável, títulos claros e estrutura acessível; não fabricar estatísticas, testemunhos, autoria ou autoridade.
- Conferir a coerência dos dados estruturados com texto, preços, serviços e imagens publicados. JSON sintaticamente válido não basta.
- Definir idioma e estratégia de URLs/traduções reais. Troca client-side de idioma não equivale a URLs localizadas indexáveis; hreflang somente com equivalentes existentes e corretos.
- Avaliar rastreamento de busca, acesso solicitado pelo usuário e treinamento separadamente. Preservar opt-outs; qualquer mudança de política exige decisão própria.
- `llms.txt` é proposta opcional, não requisito universal nem prova de vantagem. Não criar arquivos de IA ou markup apenas para cumprir uma promessa de citação.
- Registrar as lacunas de conteúdo e de produção no projeto destinatário; não substituir isso pela instalação da skill.

Referências primárias verificadas para estes limites: [Google Search: AI features](https://developers.google.com/search/docs/appearance/ai-features) declara que fundamentos de SEO permanecem relevantes, sem arquivos/markup especiais obrigatórios nem garantia de indexação; [OpenAI: crawlers](https://developers.openai.com/api/docs/bots) distingue OAI-SearchBot de GPTBot e do acesso ChatGPT-User. Não se promete ganho ou citação em IA. O plano de medição futuro precisa de autorização e deve separar recuperado, citado, mencionado e recomendado.
