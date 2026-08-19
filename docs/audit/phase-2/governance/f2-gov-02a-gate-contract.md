# F2-GOV-02A — contrato do gate universal candidato

Estado: `CANDIDATE_NOT_REQUIRED`. Base medida: `d09838956bbf455d728f7e75952cd9ec41498376`.

## Identidade estável

- Workflow: `Universal PR Gate Candidate`
- Job e check: `Universal PR Gate`
- Ficheiro: `.github/workflows/universal-pr-gate.yml`

Renomear qualquer uma destas identidades invalida as evidências e exige nova revisão. A integração deste workflow na `main` ainda não o transforma em required check; isso pertence a uma autorização posterior à F2-GOV-02B.

## Invariantes

O workflow nasce em toda `pull_request`, sem `paths` ou `paths-ignore`. `merge_group/checks_requested` está presente como preparação passiva para uma possível merge queue futura, que continua desligada. O job não possui `if`, tem timeout de 15 minutos, concorrência por PR/head, `contents: read`, Actions pinadas por SHA e um resultado terminal explícito.

Nenhum passo contém secret, FTP, deployment, push, escrita remota ou `workflow_dispatch`. A classificação lê apenas o diff entre os SHAs do evento e falha se os SHAs, o script ou os contratos estiverem ausentes.

## Política mínima de suítes

Todos os caminhos aceites executam:

1. `gate-contract` — estrutura universal, matriz e negativos;
2. `governance-contracts` — F2-00 e F2-GOV-01;
3. `deploy-protection` — tabela de verdade, builder e payload exato.

Mudanças exclusivamente dentro da superfície offline da auditoria executam também `audit-contract`. Mudanças vivas em HTML, CSS, JavaScript, fontes, traduções, imagem ou vídeo executam `browser-baseline` e `visual-evidence`. Um caminho desconhecido seleciona somente `fail-closed` e termina o job em falha antes de qualquer suite ou efeito externo.

Lighthouse, Firefox e WebKit permanecem `NOT_VERIFIED` e não são required nesta missão.

## Operações Git

O classificador aceita criação, alteração, remoção, mudança de tipo, rename e copy. A entrada é NUL-safe. Caminho vazio, absoluto, com barra invertida, travessia, estado desconhecido ou duplicação interrompe a classificação. Rename/copy avaliam origem e destino; qualquer lado desconhecido reprova.

## Não ativação

Este contrato não autoriza branch protection, ruleset, required check, merge, ensaio descartável, F2-01, deploy ou produção. Via A continua alvo; Via B permanece obrigatória até o ensaio real e uma decisão humana separada.
