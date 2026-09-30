import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
import {startStudio} from '../fixtures/website-project/studio/server.mjs';import {syntheticPNG} from './website-studio-fixtures.mjs';
const [output,packageRoot,selected='chromium,firefox,webkit']=process.argv.slice(2);assert.ok(path.isAbsolute(output)&&!fs.existsSync(output));fs.mkdirSync(output,{recursive:true});
const require=createRequire(path.join(packageRoot,'package.json')),pw=require('playwright'),hash=b=>createHash('sha256').update(b).digest('hex');
const report={mission:'WEBSITE43',playwright:require('playwright/package.json').version,startedAt:new Date().toISOString(),engines:[],cases:[],screenshots:[],errors:[],external:[]};
for(const engine of selected.split(',')){
 let browser,app;
 try{
  const dir=path.join(output,engine);fs.mkdirSync(dir);const projects=path.join(dir,'projects');fs.mkdirSync(projects);app=await startStudio(projects);browser=await pw[engine].launch({headless:true});report.engines.push({engine,version:browser.version()});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',locale:'pt-PT'});await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='127.0.0.1'&&!(u.protocol==='blob:'&&u.origin===app.url)){report.external.push(u.href);return r.abort();}return r.continue();});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push({engine,message:e.message}));page.on('dialog',d=>d.accept());
  const shot=async name=>{const file=path.join(dir,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);};
  await page.goto(app.url);await page.getByText('Receita carregada. Escolhe um nome novo para guardar a próxima versão.').waitFor();
  await page.getByLabel('Nome desta versão').fill('original-v1');await page.getByRole('button',{name:'Gerar e verificar'}).click();await page.getByRole('heading',{name:'original-v1 · pronto a experimentar'}).waitFor();
  const old=fs.readFileSync(path.join(projects,'revisions/original-v1/site/manifest.json'));
  await page.locator('#import-file').waitFor({timeout:3000});
  await page.locator('#import-file').setInputFiles({name:'cancelar.png',mimeType:'image/png',buffer:syntheticPNG()});await page.getByText('Pronto para importar. Ainda não foi gravado.').waitFor();await page.getByRole('button',{name:'Cancelar seleção',exact:true}).click();
  assert.equal((await (await fetch(app.url+'/api/state')).json()).imported.length,0);
  await page.locator('#import-file').setInputFiles({name:'grande.png',mimeType:'image/png',buffer:Buffer.alloc(2*1024*1024+1)});await page.getByText('Máximo 2 MiB por PNG. Nada foi gravado.').waitFor();assert.equal((await (await fetch(app.url+'/api/state')).json()).imported.length,0);
  const logo=syntheticPNG(128,128,[15,49,63]),hero=syntheticPNG(640,400,[179,78,38]);
  for(const [kind,bytes,name] of [['logo',logo,'simbolo-local.png'],['hero',hero,'painel-local.png']]){
   await page.locator('#import-target').selectOption(kind);await page.locator('#import-file').setInputFiles({name,mimeType:'image/png',buffer:bytes});await page.getByText('Pronto para importar. Ainda não foi gravado.').waitFor();await page.getByRole('button',{name:'Importar para o projeto',exact:true}).click();await page.getByText('Recurso importado e selecionado. Guarde uma nova versão.').waitFor();
   assert.equal(await page.locator('[id="assets.'+kind+'"]').inputValue(),'imports/'+hash(bytes)+'.png');assert.ok(await page.locator('#asset-'+kind+'-preview').evaluate(n=>n.complete&&n.naturalWidth>0));
  }
  await page.getByLabel('Fonte de texto',{exact:true}).selectOption('bricolage');await page.getByLabel('Fonte de títulos',{exact:true}).selectOption('manrope');
  await page.getByLabel('Descrição acessível da imagem',{exact:true}).fill('Painel geométrico sintético em terracota.');
  await page.getByLabel('Legenda da imagem',{exact:true}).fill('Imagem sintética criada localmente para testar a bancada.');
  await page.getByLabel('Imagem decorativa',{exact:true}).check();assert.equal(await page.getByLabel('Descrição acessível da imagem',{exact:true}).isDisabled(),true);await page.getByLabel('Imagem decorativa',{exact:true}).uncheck();
  await page.getByLabel('Descrição acessível da imagem',{exact:true}).focus();await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>parseFloat(getComputedStyle(document.activeElement).outlineWidth)>=2));
  await page.locator('#resource-editor').scrollIntoViewIfNeeded();await shot('desktop-assets');
  await page.getByLabel('Nome desta versão').fill('identity-v2');await page.getByRole('button',{name:'Guardar receita',exact:true}).click();await page.getByText('Receita identity-v2 guardada. Podes reabri-la no ponto de partida.').waitFor();
  await page.getByRole('button',{name:'Gerar e verificar'}).click();await page.getByRole('heading',{name:'identity-v2 · pronto a experimentar'}).waitFor();
  const manifest=JSON.parse(fs.readFileSync(path.join(projects,'revisions/identity-v2/site/manifest.json')));assert.equal(manifest.files.find(f=>f.path==='assets/logo.png').sha256,hash(logo));assert.equal(manifest.files.find(f=>f.path==='assets/hero.png').sha256,hash(hero));assert.deepEqual(fs.readFileSync(path.join(projects,'revisions/original-v1/site/manifest.json')),old);
  for(const [label,file] of [['Abrir página inicial ↗','home'],['Abrir contacto ↗','contact']]){
   const pending=context.waitForEvent('page');await page.getByRole('link',{name:label}).click();const preview=await pending;await preview.waitForLoadState();await preview.evaluate(()=>document.fonts.ready);assert.ok(await preview.locator('.header .logo img').evaluate(n=>n.complete&&n.naturalWidth===128));assert.match(await preview.locator('body').evaluate(n=>getComputedStyle(n).fontFamily),/bricolage/i);const picture=path.join(dir,'generated-'+file+'.png');await preview.screenshot({path:picture});report.screenshots.push(picture);await preview.close();
  }
  await page.reload();await page.getByText('Receita carregada. Escolhe um nome novo para guardar a próxima versão.').waitFor();await page.getByLabel('Receita',{exact:true}).selectOption('recipe:identity-v2');await page.getByRole('button',{name:'Carregar receita',exact:true}).click();await page.waitForFunction(()=>document.getElementById('fonts.body').value==='bricolage');assert.equal(await page.locator('[id="assets.hero"]').inputValue(),'imports/'+hash(hero)+'.png');
  for(const [width,height] of [[1440,900],[1024,768],[768,1024],[390,844],[360,800]]){
   await page.setViewportSize({width,height});await page.locator('#resource-editor').scrollIntoViewIfNeeded();const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,small:[...document.querySelectorAll('button,input,select,a')].filter(n=>n.getBoundingClientRect().width&&n.getBoundingClientRect().height&&!n.classList.contains('skip')).filter(n=>n.getBoundingClientRect().width<44||n.getBoundingClientRect().height<44).map(n=>n.id)}));assert.equal(metrics.overflow,false);assert.deepEqual(metrics.small,[]);if(width===390)await shot('mobile-assets');report.cases.push({engine,case:'responsive',width,height,state:'PASS'});
  }
  report.cases.push({engine,case:'cancel-size-import-logo-hero-font-alt-generate-reopen-v1-preserved',state:'PASS',logoSha256:hash(logo),heroSha256:hash(hero)});
 }catch(e){report.errors.push({engine,message:e.stack});process.exitCode=1;}
 finally{if(browser)await browser.close();if(app)await app.stop();}
}
report.state=report.errors.length||report.external.length?'FAIL':'PASS';report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'QA.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
