# F2-GOV-09 — handoff

## Identidade

- Issue-lock: #62
- Branch: `agent/f2-gov-09-base-only-enforcement`
- Base: `3656d57a78b777b1ff279c2cda01905877611117`
- Estado: draft; merge, cerimónia e proteção remota não autorizados.

## Escopo fechado

O conjunto original de 14 ficheiros foi publicado na Issue #62 antes da primeira edição protegida. O F2-GOV-09-F3 acrescentou `crm-gestao.html`, autorizado para remover o `preconnect` e o carregamento incondicional do Meta Pixel comprovados pelo ensaio. O F2-GOV-09-F4 mediu antes de editar e acrescentou exatamente `fixtures/audit/f2-01-transition.json` e `tests/audit/site-audit.test.mjs`: juntos, admitem somente essa página, somente sobre a base selada, e reprovam reutilização ou página adicional. O conjunto candidato total é fechado em 17 caminhos. CSS, JavaScript vivo externo à página, assets, deploy, manifesto, package/lock, baselines e worktrees históricas permanecem fora do diff.

## RED

Na base integrada da F2-GOV-08, o contrato declarava `OFFLINE_SIMULATOR_ONLY`, a matriz tinha somente quatro probes sintéticos e o Universal Gate não chamava o harness base-only. Depois da primeira evolução, o head `53ccbfa701d5a08ca32c9c16dd0481bc7e7fc7d9` ainda recusava `src/js/branct.js` apenas por conter `fetch`, incluindo o carregamento local necessário de `src/i18n/<lang>.json`. O RED corretivo foi reproduzido com o ficheiro vivo byte-idêntico e distinguido de timeout ou infraestrutura.

O primeiro ensaio comportamental revelou também uma tentativa real em `crm-gestao.html`: `fbevents.js` era inserido incondicionalmente no `<head>`. O RED permanente cobre ausência de decisão, recusa e retirada; o caminho autorizado cobre aceitação explícita e recarga com consentimento válido.

## GREEN esperado

- contrato `OPERATIONAL_CANDIDATE`;
- matriz 3 engines × 84 observações, 41 identidades e 184 ações;
- consumer/servidor/contrato/pins/matriz/expectativas carregados do base;
- staging apenas com blobs vivos allowlisted;
- JavaScript vivo executado; recursos locais são servidos somente após vínculo ao blob verificado;
- capacidades externas dormentes são inventariadas, sem allowlist por ficheiro, domínio ou URL;
- qualquer tentativa externa observada é bloqueada, registrada e causa FAIL, inclusive quando nenhum byte sai;
- fluxo candidato e probes usam contextos separados; cada probe tem identidade canónica e uma única observação produzida fora do realm da página por interceptores de host, sem binding ou token acessível ao candidato, e vinculada por igualdade estrutural de mecanismo, URL/origem, ação, fase, rota, viewport, engine, disposição e identidade;
- `consent-loader` percorre `crm-gestao.html` e prova ausência antes da decisão, na recusa e após retirada, além da única tentativa canónica após aceitação válida; a tentativa autorizada continua bloqueada e nunca é convertida em `PASS`;
- qualquer pedido loopback fora da allowlist autoritativa causa FAIL, mesmo com resposta 404;
- `preconnect` e `dns-prefetch` externos estáticos são analisados estruturalmente em atributos cotados/não cotados, qualquer ordem, espaçamento e capitalização, e recusados antes da entrega. Hints dinâmicos detetados após inserção reprovam, mas o bloqueio pré-egress desses hints permanece `NOT_VERIFIED` e não é inferido da deteção;
- `fetch` i18n local real deve concluir; contextos começam sem storage, cookies, permissões, workers ou consentimento;
- Universal Gate preserva identidade estável e termina explicitamente;
- Sentinel protege a superfície transitiva e deve reprovar esta evolução;
- Offline Audit e Universal Gate devem passar no head final;
- nenhuma execução FTP/deploy/produção.

## Cerimónia futura — proposta, não autorização

Se CI e revisão defensiva forem favoráveis, será necessária autorização nominal vinculada ao head/base finais. A exceção mínima deverá remover temporariamente somente `Gate Integrity Sentinel` dos required checks, preservar `Universal PR Gate` strict/app_id 15368 e todos os demais campos, executar merge normal uma única vez, restaurar imediatamente a proteção integral e exigir readback idêntico dentro de janela máxima de 15 minutos.

## Riscos residuais

1. O enforcement candidato ainda não foi observado a partir da `main` numa PR posterior.
2. A passagem transitória da própria evolução depende da Sentinel deliberadamente vermelha e de cerimónia humana.
3. Falha de infraestrutura do GitHub Actions permanece inconclusiva; nunca conta como PASS nem RED semântico.
4. O runtime browser Windows é `NOT_APPLICABLE` à imagem OCI Linux; a portabilidade estrutural é exercitada em LF/CRLF e por contratos determinísticos.
5. A análise estática permanece inventário complementar: ofuscação e fluxos não exercitados não podem ser declarados seguros sem observação runtime. O enforcement real pós-integração continua `NOT_VERIFIED`.

## Rollback

Após eventual integração: nova PR protegida com `git revert -m 1 <merge_sha>`. Sem push direto, squash, rebase, force-push ou bypass permanente.
