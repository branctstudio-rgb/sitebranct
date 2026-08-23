# Plano de implementação F2-01

Estado: `F2_01_AUTORIZADA_EM_DESENVOLVIMENTO`, ainda não integrada. O plano autoriza desenvolvimento controlado em PR; merge, deploy e produção continuam dependentes de gate humano próprio.

## Fronteira entre design system e páginas

A fronteira do design system termina em tokens e comportamentos partilhados necessários para cumprir overflow, 44×44, foco e menu. Alterações de páginas só podem ajustar markup acessível estritamente necessário; copy, narrativa, secções, imagens e direção visual permanecem congeladas. Uma exceção deve ser demonstrada rota a rota e aprovada antes do código.

## Ficheiros previstos

- `src/css/branct.css`: dimensões de controlos, contenção, regras responsivas e reduced motion partilhadas.
- `src/js/branct.js`: contrato de abertura/fecho, foco, Escape, `aria-expanded` e scroll lock.
- HTML das rotas que usam o header partilhado: somente se o RED provar que ARIA ou estrutura não pode ser corrigida no código partilhado.
- `crm-gestao.html`: somente se a implementação standalone reproduzir o defeito e exigir correção equivalente; a alteração deve ficar isolada e sem copy nova.
- `tests/audit/` e `fixtures/audit/`: medições, comportamento, manifesto e evidência reproduzível.

A lista final deve ser determinada pelo RED e reservada na Issue antes de editar. `deploy.yml`, manifesto de publicação e assets não são ficheiros previstos.

## Sequência RED→GREEN

1. Criar branch/worktree a partir da base humana autorizada e congelar o inventário de ficheiros.
2. Reexecutar as 60 observações e guardar RED por rota/viewport, incluindo overflow, alvos, consola e menu.
3. Adicionar testes comportamentais de teclado e ARIA que falhem contra a implementação atual.
4. Corrigir primeiro a causa partilhada mínima em CSS/JS; evitar exceções de rota.
5. Corrigir markup apenas onde o teste provar necessidade, sem conteúdo editorial novo.
6. Reexecutar os testes até GREEN em todas as rotas e viewports; falhar fechado em qualquer entrada ausente.
7. Capturar antes/depois, validar imagens e comparar consola, foco, conteúdo e movimento reduzido.
8. Executar revisão visual e adversarial independente no head exato.
9. Publicar PR draft e parar no gate humano. Sob autoridade offline, o merge é proibido porque HTML/CSS/JS em `main` acionam FTP.

## QA multiviewport e revisão visual

- Matriz completa: 12 rotas × `1440×900`, `1024×768`, `768×1024`, `390×844`, `360×800`.
- Confirmar `scrollWidth <= clientWidth`, alvos ≥44×44 CSS px e zero conteúdo cortado.
- Percorrer header/menu apenas com teclado em cada padrão estrutural e validar foco após Escape.
- Ativar `prefers-reduced-motion: reduce` e confirmar equivalência funcional.
- Comparar capturas lado a lado, incluindo estados fechado, aberto, foco e conteúdo longo.
- Registar Chromium. Firefox e WebKit ficam `NOT_VERIFIED` até execução real.

## Riscos e contenções

- Aumentar alvos pode recriar overflow: medir ambos no mesmo gate.
- Scroll lock pode causar salto de layout: preservar/restaurar estado e medir largura antes/depois.
- Foco pode escapar para conteúdo de fundo: testar sequência bidirecional e modalidade.
- CSS partilhado pode afetar 10 rotas: exigir matriz completa, não amostragem.
- CRM standalone pode divergir: tratar como variante explícita, não copiar regras cegamente.
- Correção pode alterar narrativa visual: revisão de diff e captura deve bloquear mudanças não funcionais.

## Rollback

Antes do merge, abandonar a branch preserva a main. Após um merge autorizado, usar `git revert -m 1 <merge_sha>` para preservar história; reexecutar os gates offline e confirmar que a proteção de deploy permanece. Rollback não autoriza deploy nem restauração manual em produção.

## Gates humanos

- Gate 1: aprovar Issue-lock, base, ficheiros e critérios antes do RED.
- Gate 2: aprovar qualquer expansão de escopo antes de editar ficheiro não reservado.
- Gate 3: aprovar o head com CI e revisão independentes apenas para revisão offline; isso não autoriza merge.
- Gate 4: decidir e autorizar primeiro preview/staging ou suspensão controlada do deploy; só uma autorização separada, consciente do efeito de publicação, pode permitir merge normal.
- Gate 5: depois de eventual merge com publicação explicitamente abrangida, confirmar o resultado e parar.

Nenhum gate desta especificação autoriza FTP, `workflow_dispatch`, secrets ou produção. A arquitetura atual não permite prometer ausência de deploy depois de integrar ficheiros vivos; por isso o plano termina antes do merge.
