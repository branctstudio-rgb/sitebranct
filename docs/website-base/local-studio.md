# Bancada local de criação

Na raiz deste checkout, com Node disponível:

```powershell
./fixtures/website-project/studio/start.ps1 -Projects "$([Environment]::GetFolderPath('MyDocuments'))/branct-projetos"
```

Abrir o URL `127.0.0.1` retornado. Alternativa, com pasta de projetos já existente: `node fixtures/website-project/studio/server.mjs start CAMINHO_ABSOLUTO_DA_PASTA`.

1. Carregar **BRANCT · receita aprovada** ou uma receita/versão guardada.
2. Editar identidade, paleta, fontes, textos, etapas, rotas e referências do catálogo. Só assets já aprovados; sem uploads. O catálogo inicial contém o logótipo e a imagem da receita BRANCT. A proveniência e a raiz dos assets não são editáveis no browser.
3. **Validar receita** identifica o primeiro erro do contrato original. Corrigi-lo e voltar a validar. Contraste inválido e recursos fora do catálogo são recusados.
4. Dar um nome novo, como `ensaio-v1`. **Guardar receita** salva a configuração. **Gerar e verificar** cria a configuração e 14 ficheiros numa nova revisão e abre os links das duas páginas reais.
5. Editar e usar `ensaio-v2`. A v1 fica intacta. Reabrir pela lista de receitas ou versões; a interface pede confirmação antes de descartar alterações por guardar.
6. **Encerrar esta prévia** fecha só esse servidor. **Encerrar bancada** fecha a sessão e todos os seus previews, guardando recibos. Fechar o separador não encerra o serviço.

Paragem alternativa, com o caminho `record` retornado no arranque:

```powershell
node fixtures/website-project/studio/server.mjs stop CAMINHO_ABSOLUTO_DO_REGISTO
```

Não substitua esse comando por encerramento genérico de Node. Cada arranque tem identidade própria; receitas e revisões persistem na pasta de projetos. Recibos ficam em `sessions`, logs de arranque na raiz. A paragem verifica a sessão viva antes de agir. Para retomar, executar o mesmo arranque e usar o novo URL/registo.

## Limites

Somente loopback e operador local de confiança. Não é servidor público, sandbox de uploads nem defesa contra outro processo local privilegiado que modifique simultaneamente a pasta. Não mover/substituir assets/ficheiros enquanto serve; adulterações de receita/saída são recusadas ao abrir/servir a prévia. Sem shell, endpoints reais, recolha de contactos, secrets, CRM ou publicação. Conteúdo local-draft, noindex e publicationAllowed=false permanecem obrigatórios. As páginas de contacto são rascunhos sem envio. Revisão de copy, direitos, QA da receita final e autorização de publicação continuam separados.

O editor reutiliza `project.mjs`, `build/generate/verify`, assets/fontes locais e `preview.mjs`; não altera a base, Cedro/Linha, workflows ou páginas vivas. PT-PT, duas páginas, sem novas dependências. Não editar JSON à mão é possível neste catálogo fechado; recursos novos exigem revisão fora da bancada.
