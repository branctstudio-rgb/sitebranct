# Dois atos separados — nenhum executado pelo preparo

## A. Publicação e registro

Branch candidata: `agent/website-webkit-diagnostic-21`. Título proposto da PR própria: **Prepare WebKit-only diagnostic21 with structured failure observability**. Corpo pronto está no pacote de entrega local, vinculado ao head final e diff; não reutilizar PR63.

Após autorização nominal vinculada ao head final, reconfirmar main851c1723119b62193623fa24e67090afd18b39f1, branchlimpa/cadeia/diff exatos e revisão. Push normal somente da branch própria; abrir PRdraft contra main. Nenhum merge/alteração de proteção está autorizado aqui. O novo workflow manual só poderá ser usado depois de integração/registro próprios aprovados. Não usar o workflow13 antigo.

Comandos de publicação (NÃO EXECUTADOS; somente depois da autorização que fixe HEAD_FINAL):

```
git push origin HEAD_FINAL:refs/heads/agent/website-webkit-diagnostic-21
gh pr create --repo branctstudio-rgb/sitebranct --base main --head agent/website-webkit-diagnostic-21 --draft --title "Prepare WebKit-only diagnostic21 with structured failure observability" --body-file PR_BODY.md
```

HEAD_FINAL é resolvido no manifesto externo de entrega; não é permissão para publicar qualquer HEAD corrente. Merge/registro requerem decisão separada e gates da ViaA. Não há token/approval autorreferente no commit.

## B. Uma execução futura, exclusivamente WebKit

Identificador reservado apenas como proposta: **WEBSITE-WEBKIT-21-20260913-01 — PROPOSTO_NAO_AUTORIZADO**. Não foi emitido evento. Se a data da decisão mudar, gerar outro IDnovo e auditar o histórico; nenhum IDconsumido pode ser usado.

Após registro, obter o SHAreal da main que contém este candidato e seus pins, e emitir offline:

```
node scripts/governance/website-webkit-21/propose.mjs SHA_REAL_DA_MAIN_REGISTRADA WEBSITE-WEBKIT-21-20260913-01
```

O gerador valida SHA40hex e o formato do ID, e insere aplicação/digestexatos. A ausência de uso do ID exige a auditoria posterior do histórico; não é verificada pelo gerador offline. Não faz chamada remota. O SHA pós-registro não existe nesta entrega; não será inventado ou substituído pelo head do candidato.

O Conselho deve aprovar nominalmente os três inputs gerados, imagem/downloads, aplicação, tarefa única e efeito workflow_dispatch. Antes do evento, reconfirmar main/ref/workflowid/pins/objetos, Actions disponível, runhistory completo, identificadorsemuso, ausência de execução concorrente e evidência de autorização. O guard aplica somente main/attempt1/workflowexato e o históricoexige exatamente o run corrente com esseID. Incompletude, rate-limit ou drift interrompem sem retry.

Único ponto de ativação, após aprovação e readback (NÃO EXECUTADO):

```
gh workflow run website-webkit-diagnostic-21.yml --repo branctstudio-rgb/sitebranct --ref main -f wrapper_sha=SHA_REAL_DA_MAIN_REGISTRADA -f authorization_id=WEBSITE-WEBKIT-21-20260913-01 -f "authorization=AUTHORIZE WEBSITE-WEBKIT-21-20260913-01 SHA_REAL_DA_MAIN_REGISTRADA 563f3c13665347b2a8578110e519ebaf13f356e8 DIGEST_EXATO_DO_SOURCE_PACKAGE"
```

Usar literalmente os inputs do gerador conferidos com a autorização; `DIGEST_EXATO_DO_SOURCE_PACKAGE` vem do manifesto concreto, não é escolha livre. Reservar recibo local exclusivo ANTES da chamada. Resposta incerta não autoriza repetição. Não rerun, fechar/reabrir PR, commit vazio, outro evento ou browser adicional.

## Execução/encerramento

1. Guard sem checkout validaenvelope; checkoutwrapper na mainSHA e aplicaçãonoSHA563,credenciais não persistidas.
2. Host verifica pins/objetos/limpeza/resources/Docker/histórico; cria raiz exclusiva `/var/tmp/branct-website-webkit-21` e recibo de posse. Existência prévia interrompe.
3. Prepare: bundlefonte exato, checksums, dockerpull digestpinado, npm ci lock semscripts/browserdownload. Custos/downloads do Actions exigem autorização B.
4. Measure: container `website-21-measure`, rede none; somente responsive-webkit, nenhum cenário removido. Toda saída desconhecida falha.
5. Finally: parar somente `website-21-npm` e `website-21-measure` cuja imagem,mount,criação e recibo demonstrem posse. Nada de rm/prune. Cleanupfalho =>REJECT; não ler artefatos possivelmente correndo.
6. Always do workflow repete apenas cleanup/collect-only idempotente, nunca medição. Se evidência saneada válida já existe, preserva-a. Uploadexato dos quatroficheiros,14dias,overwritefalse.
7. Readbacksomente do run exato: status/job/steps e quatroartefatos. Reportar campos fechados; UNKNOWNnãoéPASS. Preservar execução19 separadamente.

## Resultado, limites e falhas

Exit0/completude só qualifica diagnósticoWebKit, não aceiteF2-01 nem execução dos outrosengines. WebKitfalhou/incompleto =>diagnóstico não aceito; guardar fase/ações/exit/sinal e classificação semtexto. Causa livre ausente continuaUNKNOWN.

Timeout/cancelamento/jobinterrompido pode impedir callbacks; always tenta cleanup mas infraestrutura indisponível impede confirmação. Nesse caso declarar cleanupNOT_VERIFIED/incidente de diagnóstico, nunca compensar com outro run. A VM hospedada é efêmera; não afirmar inspeção operacional não realizada.

Rollback operacional: parar somente recursosprovadospróprios pelo wrapper, sem reaproveitar ID ou alterarprodução. Rollback de conteúdo futuro: nova PRnormal de revert do merge que registrar este pacote. Nenhuma regra/proteção deve ser enfraquecida por este roteiro.

Não autorizado nesta entrega: execução, publicação, merge, bypass,credenciaisnovas, FTP,deploy,produção,aplicação/F2-01funcional,PR63 ou outrasmissões.
