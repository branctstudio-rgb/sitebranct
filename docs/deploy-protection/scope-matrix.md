# Proteção do deploy FTP por escopo

Issue-lock: #3

Base: `main@da8800cd7669f66a82cbf9cd2e4f22fa99d59320`

Branch: `agent/deploy-scope-guard`

## Estado observado

O workflow anterior tinha `push.branches: [main]` sem filtro de caminhos. Portanto, qualquer merge/push na `main` — inclusive somente documentação, testes, fixtures ou workflow de auditoria — iniciava o job que contém FTP.

O `lftp mirror` atual publica, a partir da árvore versionada na base, os HTML raiz, `.htaccess`, `robots.txt`, `sitemap.xml`, CSS, JavaScript, fontes, traduções e media em `src/img/`. O próprio mirror exclui `src/img/video.mp4`, documentação, GitHub workflows, dependências, Supabase, modelos e fontes 3D. Nenhum comando FTP foi executado para obter esta conclusão; ela resulta da leitura integral do workflow e da enumeração da árvore Git.

## Lista positiva automática

- `*.html`
- `.htaccess`
- `robots.txt`
- `sitemap.xml`
- `src/css/**`
- `src/js/**`
- `src/fonts/**`
- `src/i18n/**`
- `src/img/**`, mantendo a exclusão já existente de `src/img/video.mp4`

Alterar o próprio workflow não pertence à lista de push e não publica automaticamente. `workflow_dispatch` permite execução manual deliberada somente a partir da `main`. Em pull requests que alterem esta proteção, somente o job offline `verify-scope` pode executar; o job `deploy` rejeita eventos `pull_request` por condição explícita.

## Tabela de verdade executável

| Caso | Deploy automático |
|---|---|
| Somente `docs/audit/**` | não |
| Somente `tests/**` | não |
| Somente `fixtures/audit/**` | não |
| HTML raiz | sim |
| `src/css/**` | sim |
| `src/js/**` | sim |
| Imagem/media publicado | sim |
| Fonte publicada | sim |
| Tradução `src/i18n/**` | sim |
| Documentação + ficheiro vivo | sim |
| Somente workflow de auditoria | não |
| Somente workflow de deploy | não |
| `src/img/video.mp4` | não |
| `workflow_dispatch` autorizado na `main` | permitido |

A matriz vive em `tests/deploy/deploy-scope.test.mjs` e também enumera todos os ficheiros vivos atuais para detetar omissões futuras.

## RED→GREEN

RED: 4/5 testes falharam na base. O caso “somente documentação” devolveu `true`; não existiam `workflow_dispatch`, separação PR/deploy ou Actions pinadas.

GREEN: o filtro positivo, o despacho manual, as condições de jobs e os SHAs imutáveis satisfazem 5/5 testes. O bloco protegido desde o comentário “O repo fica legível” até ao fim mantém SHA-256 `7c4c0839fe38865b61aa4cef463788f163d3e8f8adefdbe59b4e2d4b4e0264ea`, cobrindo minificação, instalação, variáveis, destino e comando mirror.

## Riscos e rollback

- Um novo tipo de caminho vivo exigirá atualização explícita da lista positiva. O teste cobre toda a árvore viva atual, não ficheiros futuros ainda inexistentes.
- O payload do mirror continua com as exclusões originais por exigência de não alterar comandos. Esta missão controla o gatilho; não redesenha a política de conteúdo do mirror.
- `workflow_dispatch` é uma capacidade manual sensível, limitada pela condição do job à `main`, e deve ser usada somente por operador autorizado.
- Rollback: reverter exclusivamente o commit desta missão. Isso restaura o gatilho genérico anterior; portanto, o rollback deve ocorrer apenas com consciência de que merges documentais voltariam a poder iniciar FTP.

## Gate

Nenhum FTP, deploy, secret, produção, página, CSS, JavaScript ou asset vivo foi tocado. Parar antes do merge e aguardar revisão defensiva e autorização humana.
