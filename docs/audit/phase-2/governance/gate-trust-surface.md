# F2-GOV-02C-F1 — superfície transitiva de confiança

Estado: contrato offline; não ativa proteção técnica.

A fonte operacional canónica é `protectedPaths` no workflow base-only `gate-integrity-sentinel.yml`. O inventário foi derivado dos comandos de `universal-pr-gate.yml`, dos imports locais e de cada leitura de contrato, manifesto, fixture e evidência capaz de decidir PASS/FAIL. HTML, CSS, JavaScript e assets vivos são sujeitos da verificação, não autoridades; continuam permitidos pela sentinela.

O conjunto fechado cobre workflows, classificador, construtor do payload, testes executados direta ou transitivamente, scripts de browser/visual, contratos, manifestos, fixtures, documentação normativa, controlo negativo e as 13 evidências. Ele é auto-protegido porque contém a própria sentinela.

A inspeção considera `filename` e `previous_filename`. Alteração, remoção, rename, substituição ou esvaziamento de um membro protegido falham antes de código da PR ser executado. Metadados vazios/malformados, JSON inválido, HTTP diferente de 200, timeout, paginação incompleta ou 3.000 ou mais registos falham fechado.

Não existe exceção automática. Evoluir um componente protegido exige missão humana separada: atualizar a sentinela numa PR dedicada, revisão independente vinculada ao SHA, integrar a nova base e somente depois propor a evolução. Via B continua obrigatória.

Esta correção permanece NÃO ATIVÁVEL como required check até integração na main, observação do run base-only numa PR posterior, repetição dos cenários reais e autorização humana separada.
