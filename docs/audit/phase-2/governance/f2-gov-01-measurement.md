# F2-GOV-01 — medição read-only

Medição UTC: `2026-08-19T15:03:31Z`. Base: `dce434dd3fe863a724ce8ea879d29093473dde4c`. Estado: diagnóstico, não ativação.

## Evidência API

| Capacidade | Estado medido | Classificação | Evidência |
|---|---|---|---|
| Visibilidade | pública; owner `User` | DISPONÍVEL_E_MEDIDA | `GET /repos/branctstudio-rgb/sitebranct` |
| Plano da conta | endpoint autenticado não expôs `plan` | NOT_VERIFIED | `GET /user`; não inferido |
| Permissão da credencial | `admin`, push/maintain/triage/pull | DISPONÍVEL_E_MEDIDA | collaborator permission API |
| Proteção de `main` | `protected:false`; protection API 404 | INDISPONÍVEL no estado atual | branches/protection APIs |
| Rulesets | lista vazia | INDISPONÍVEL no estado atual | `GET /repos/.../rulesets` retornou `[]` |
| Push direto | credencial tem push e branch não é protegida | DISPONÍVEL_NÃO_ENSAIADA | não foi feito push de teste |
| Force-push | nenhuma proteção o bloqueia | DISPONÍVEL_NÃO_ENSAIADA | não ensaiado por segurança |
| Apagar `main` | nenhuma proteção o bloqueia | DISPONÍVEL_NÃO_ENSAIADA | não ensaiado por segurança |
| Merge commit | interface permite | DISPONÍVEL_E_MEDIDA | `allow_merge_commit:true` |
| Squash/rebase | interface permite ambos | DISPONÍVEL_E_MEDIDA | `allow_squash_merge:true`, `allow_rebase_merge:true`; procedimento não os autoriza |
| Auto-merge | desativado | INDISPONÍVEL no estado atual | `allow_auto_merge:false` |
| Preservar branch | ativo | DISPONÍVEL_E_MEDIDA | `delete_branch_on_merge:false` |
| Required checks | recurso documentado; nenhum configurado | DISPONÍVEL_NÃO_ENSAIADA | branch protection vazia |
| Dismiss stale reviews | recurso documentado; desligado | DISPONÍVEL_NÃO_ENSAIADA | sem proteção ativa |
| Conversation resolution | recurso documentado; desligado | DISPONÍVEL_NÃO_ENSAIADA | sem proteção ativa |
| Required reviewer | dois colaboradores com write/admin; regra não ensaiada | DISPONÍVEL_NÃO_ENSAIADA | collaborators API |
| Bypass administrativo | admin atualmente irrestrito | DISPONÍVEL_E_MEDIDA | branch sem proteção; owner pode gerir regras |
| Restrição de bypass a agentes | proposta possível via `enforce_admins`, mas owner pode remover regra | DISPONÍVEL_NÃO_ENSAIADA | risco administrativo residual |

## Checks e workflows reais

- `contract` — job do workflow **Offline audit contract**, observado com sucesso em `c0f2abc…`. Executa somente em PRs que tocam `docs/audit/**`, `fixtures/audit/**`, `tests/audit/**` ou o workflow de auditoria.
- `Verificar escopo do deploy` — job do workflow **Deploy para Hostinger (FTP)**, observado com sucesso em `949524e…`. Executa em PRs que tocam caminhos publicados ou proteção do deploy.
- `Deploy via FTP` não é check elegível para PR: fica skipped em PR e pode executar em push `main` com caminhos vivos ou `workflow_dispatch` na `main`.

Nenhum dos dois checks de verificação nasce em todo tipo de PR. A documentação oficial alerta que checks requeridos cujo workflow é ignorado por path filtering podem permanecer `Pending` e bloquear merge. Por isso `requiredNow` é vazio e a ativação completa fica bloqueada; não se inventa um terceiro nome.

## Disponibilidade oficial

Consulta em `2026-08-19` aos documentos oficiais:

- [About protected branches](https://github.com/github/docs/blob/a34bf588b9e6eff791e173fdd3a726dfab26f888/content/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches.md): proteção pode exigir PR, reviews, checks e conversas; bloqueia force-push/deleção por defeito. Também afirma que admins não são abrangidos por defeito, mas podem ser incluídos.
- [Troubleshooting required status checks](https://github.com/github/docs/blob/a34bf588b9e6eff791e173fdd3a726dfab26f888/content/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks.md): check deve passar no SHA mais recente; filtros podem deixar check obrigatório pendente.
- [About rulesets](https://github.com/github/docs/blob/a34bf588b9e6eff791e173fdd3a726dfab26f888/content/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets.md): rulesets podem acumular-se e possuem estados de enforcement; nenhum existe neste repo.
- [GitHub's plans](https://github.com/github/docs/blob/a34bf588b9e6eff791e173fdd3a726dfab26f888/content/get-started/learning-about-github/githubs-plans.md): repositórios públicos de contas pessoais têm conjunto completo; recursos avançados em privados variam. O plano concreto da conta continua `NOT_VERIFIED` porque a API não o expôs.

As citações são resumos curtos; os links fixam o commit oficial consultado.
