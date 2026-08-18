# Evidências

## Baseline visual

As 13 capturas JPEG em `baseline/` foram geradas da worktree local na base auditada, sem submissão de formulários. O manifesto `fixtures/audit/evidence-manifest.json` fixa nome, dimensão real e SHA-256; `fixtures/audit/baseline-results.json` fixa navegador, método e matriz bruta.

### Matriz DOM reproduzível

`node tests/audit/collect-browser-baseline.mjs --check fixtures/audit/baseline-results.json` inicia apenas um servidor estático local e Chrome/Chromium headless. Mede 12 rotas nos cinco viewports e compara overflow, largura, targets, H1, `alt`, hreflang e consola com o snapshot. Para atualizar deliberadamente a matriz: `node tests/audit/collect-browser-baseline.mjs fixtures/audit/baseline-results.json`.

### Capturas visuais versionadas

As 13 imagens não são regeneradas pelo comando `--check`. Foram produzidas por `node tests/audit/collect-browser-baseline.mjs --capture docs/audit/evidence/baseline`, que percorre cada página, espera fontes/assets e neutraliza estados de reveal somente no contexto da captura. `node tests/audit/check-visual-evidence.mjs` decodifica os pixels e rejeita bandas verticais praticamente uniformes; o contrato também exige que o diretório e o manifesto tenham exatamente o mesmo conjunto único de ficheiros.

O mesmo gate precisa aceitar as 13 imagens atuais e rejeitar `fixtures/audit/invalid-home-390x844.jpg`, controlo negativo preservado da ronda anterior. A tabela integral das 13 imagens antigas e o critério composto estão em `legacy-classifier.md`.

- Home: 1440×900, 1024×768, 768×1024, 390×844 e 360×800.
- CRM: desktop, tablet e mobile.
- Website Premium: desktop, tablet e mobile.

As capturas de página inteira não têm necessariamente a largura solicitada: a barra de scroll reduz a área útil e, em mobile, o overflow horizontal expande a imagem até 417 px. As duas capturas com sufixo `viewport` registam apenas a área visível (1425×900 e 390×844). Isto é evidência do defeito observado, não uma equivalência entre tamanho solicitado e tamanho do ficheiro.

## Matriz observada

| Rota | Desktop overflow | Tablet overflow | Mobile overflow | Mobile targets <44 |
|---|---:|---:|---:|---:|
| index | não | não | sim (416/375) | 28 |
| crm-gestao | não | não | não | 9 |
| website-premium | não | não | sim (416/375) | 20 |
| landing-page | não | não | sim (416/375) | 20 |
| automacao-ia | não | não | sim (416/375) | 20 |
| processo | não | não | sim (416/375) | 20 |
| contactos | não | não | sim (416/375) | 21 |
| politica-privacidade | não | não | não | 16 |
| area-do-usuario | não | não | sim (416/375) | 10 |
| blog | não | não | sim (416/375) | 21 |
| servicos | não | não | sim (416/375) | 24 |
| styleguide | não | não | não | 3 |

Todas as rotas observadas: um H1, `lang=pt-PT`, zero imagens sem `alt` e zero erros/warnings de consola capturados. Nenhuma rota possui hreflang.
