# F2-GOV-09 — handoff

## Identidade

- Issue-lock: #62
- Branch: `agent/f2-gov-09-base-only-enforcement`
- Base: `3656d57a78b777b1ff279c2cda01905877611117`
- Estado: draft; merge, cerimónia e proteção remota não autorizados.

## Escopo fechado

O conjunto fechado de 14 ficheiros foi publicado na Issue #62 antes da primeira edição protegida. HTML, CSS, JavaScript vivo, assets, deploy, manifesto, package/lock, transição F2-01, baselines e worktrees históricas permanecem fora do diff.

## RED

Na base integrada da F2-GOV-08, o contrato declarava `OFFLINE_SIMULATOR_ONLY`, a matriz tinha somente quatro probes sintéticos e o Universal Gate não chamava o harness base-only. Os testes F2-GOV-09 falharam explicitamente por estado e cardinalidade, não por infraestrutura.

## GREEN esperado

- contrato `OPERATIONAL_CANDIDATE`;
- matriz 3 engines × 84 observações, 41 identidades e 184 ações;
- consumer/servidor/contrato/pins/matriz/expectativas carregados do base;
- staging apenas com blobs vivos allowlisted;
- rede browser loopback-only exercitada por probe real;
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

## Rollback

Após eventual integração: nova PR protegida com `git revert -m 1 <merge_sha>`. Sem push direto, squash, rebase, force-push ou bypass permanente.
