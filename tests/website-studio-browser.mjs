// Focal UI acceptance only. No install, remote service or historical matrix rerun.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {startStudio} from '../fixtures/website-project/studio/server.mjs';

const [evidence,packageRoot,selectedEngines='chromium,firefox,webkit']=process.argv.slice(2);
const engines=selectedEngines.split(',');assert.ok(engines.length&&new Set(engines).size===engines.length&&engines.every(e=>['chromium','firefox','webkit'].includes(e)));
assert.ok(path.isAbsolute(evidence||'')&&!fs.existsSync(evidence),'new absolute evidence directory');
const require=createRequire(path.join(packageRoot,'package.json')),pw=require('playwright');
fs.mkdirSync(evidence);
const report={mission:'WEBSITE42',requestedEngines:engines,startedAt:new Date().toISOString(),playwright:require('playwright/package.json').version,engines:[],cases:[],screenshots:[],errors:[],externalAttempts:[]};
const hashes=dir=>Object.fromEntries(fs.readdirSync(dir,{recursive:true}).filter(n=>fs.lstatSync(path.join(dir,n)).isFile()).sort().map(n=>[n,createHash('sha256').update(fs.readFileSync(path.join(dir,n))).digest('hex')]));
for(const engine of engines){
 let browser,app;
 try{
  const folder=path.join(evidence,engine);fs.mkdirSync(folder);const projects=path.join(folder,'projects');fs.mkdirSync(projects);
  app=await startStudio(projects);browser=await pw[engine].launch({headless:true});
  report.engines.push({engine,state:'EXECUTED',version:browser.version()});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'){report.externalAttempts.push({engine,url:url.href});return route.abort();}return route.continue();});
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push({engine,message:error.message}));
  page.on('dialog',dialog=>dialog.accept());
  const screenshot=async name=>{const file=path.join(folder,name+'.png');await page.screenshot({path:file,caret:'initial'});report.screenshots.push(file);};
  await page.goto(app.url);await page.getByText('Receita carregada. Escolhe um nome novo para guardar a próxima versão.').waitFor();await page.evaluate(()=>document.fonts.ready);
  await screenshot('desktop');
  // WebKit's host keyboard preferences can skip anchors on Tab; exercise the skip link with Enter,
  // then tab among the actual editor controls in every engine.
  await page.locator('.skip').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'editor');
  await page.getByLabel('Nome da marca',{exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'origin');
  assert.ok(await page.evaluate(()=>parseFloat(getComputedStyle(document.activeElement).outlineWidth)>=2));
  await page.getByLabel('Nome da marca',{exact:true}).fill('');await page.getByRole('button',{name:'Validar receita',exact:true}).click();
  await page.locator('[id="name"][aria-invalid="true"]').waitFor();assert.equal(await page.evaluate(()=>document.activeElement.id),'name');assert.equal(await page.locator('#version-name').getAttribute('aria-invalid'),null);
  await page.getByLabel('Nome da marca',{exact:true}).fill('BRANCT · ensaio local');
  await page.getByLabel('Título principal',{exact:true}).fill('');await page.getByRole('button',{name:'Validar receita',exact:true}).click();await page.locator('[id="content.headline"][aria-invalid="true"]').waitFor();assert.equal(await page.evaluate(()=>document.activeElement.id),'content.headline');
  await page.getByLabel('Título principal',{exact:true}).fill('Projeto sintético de bancada');
  for(const [key,bad,good,focus] of [['routes.home','../bad','index.html','routes.home'],['palette.ink',await page.locator('[id="palette.bg"]').inputValue(),await page.locator('[id="palette.ink"]').inputValue(),'palette.ink'],['content.steps','','Etapa um\nEtapa dois','content.steps']]){
   const input=page.locator('[id="'+key+'"]');await input.fill(bad);await page.getByRole('button',{name:'Validar receita',exact:true}).click();
   await page.locator('[id="'+focus+'"][aria-invalid="true"]').waitFor({timeout:3000});assert.equal(await page.evaluate(()=>document.activeElement.id),focus);
   assert.ok(await page.locator('[id="'+focus+'-error"]').textContent());await input.fill(good);
  }
  // A deliberately delayed response proves controls cannot change under a pending save.
  let release,intercepted,handled;const interceptedPromise=new Promise(r=>intercepted=r),delay=new Promise(r=>release=r),handledPromise=new Promise(r=>handled=r);
  await page.route('**/api/validate',async route=>{intercepted();await delay;await route.continue();handled();});
  await page.getByRole('button',{name:'Validar receita',exact:true}).click();await interceptedPromise;
  const editLocked=await page.getByLabel('Título principal',{exact:true}).isDisabled();release();await handledPromise;await page.unroute('**/api/validate');
  assert.equal(editLocked,true,'inputs must be locked while an operation is in progress');
  await page.getByText('Receita válida. Ainda não foi gerada nem publicada.').waitFor();
  report.cases.push({engine,case:'field-error-focus-keyboard-and-operation-lock',state:'PASS'});
  await page.getByLabel('Nome desta versão').fill('ensaio-v1');await page.getByRole('button',{name:'Guardar receita',exact:true}).click();await page.getByText('Receita ensaio-v1 guardada. Podes reabri-la no ponto de partida.').waitFor();
  await page.getByRole('button',{name:'Gerar e verificar'}).click();await page.getByRole('heading',{name:'ensaio-v1 · pronto a experimentar'}).waitFor();
  const first=hashes(path.join(projects,'revisions','ensaio-v1'));assert.equal(Object.keys(first).length,15);
  for(const label of ['Abrir página inicial ↗','Abrir contacto ↗']){
   const popupPromise=context.waitForEvent('page');await page.getByRole('link',{name:label}).click();const popup=await popupPromise;await popup.waitForLoadState('load');
   assert.ok(await popup.getByRole('heading',{level:1}).isVisible());assert.equal(await popup.locator('meta[name=robots]').getAttribute('content'),'noindex, nofollow, noarchive');
   const file=path.join(folder,label.includes('inicial')?'generated-home.png':'generated-contact.png');await popup.screenshot({path:file,caret:'initial'});report.screenshots.push(file);await popup.close();
  }
  await page.getByLabel('Título principal',{exact:true}).fill('Revisão dois — sem substituir a primeira');
  await page.getByRole('button',{name:'Gerar e verificar'}).click();await page.locator('#version-name[aria-invalid=true]').waitFor();assert.equal(await page.evaluate(()=>document.activeElement.id),'version-name');
  await page.getByLabel('Nome desta versão').fill('ensaio-v2');await page.getByRole('button',{name:'Gerar e verificar'}).click();await page.getByRole('heading',{name:'ensaio-v2 · pronto a experimentar'}).waitFor();
  assert.deepEqual(hashes(path.join(projects,'revisions','ensaio-v1')),first);
  await page.getByLabel('Receita',{exact:true}).selectOption('recipe:ensaio-v1');await page.getByRole('button',{name:'Carregar receita',exact:true}).click();await page.getByText('Receita carregada. Escolhe um nome novo para guardar a próxima versão.').waitFor();assert.equal(await page.getByLabel('Título principal',{exact:true}).inputValue(),'Projeto sintético de bancada');
  await page.getByLabel('Receita',{exact:true}).selectOption('revision:ensaio-v2');await page.getByRole('button',{name:'Carregar receita',exact:true}).click();await page.waitForFunction(()=>document.getElementById('content.headline').value.startsWith('Revisão dois'));
  const refused=await page.evaluate(async()=>{const s=await (await fetch('/api/state')).json();return (await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':s.token},body:JSON.stringify({name:'../escape',recipe:s.recipe})})).status;});assert.equal(refused,422);
  report.cases.push({engine,case:'save-generate-two-routes-v2-reopen-v1-intact-root-refusal',state:'PASS',v1Hashes:first});
  for(const [width,height] of [[1440,900],[1024,768],[768,1024],[390,844],[360,800]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
   const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,small:[...document.querySelectorAll('button,input,select,a')].filter(n=>n.getBoundingClientRect().width&&n.getBoundingClientRect().height&&getComputedStyle(n).visibility!=='hidden'&&!n.classList.contains('skip')).filter(n=>n.getBoundingClientRect().height<44||n.getBoundingClientRect().width<44).map(n=>n.id||n.textContent)}));
   assert.ok(layout.scroll<=layout.width,JSON.stringify(layout));assert.deepEqual(layout.small,[]);
   if(width===390)await screenshot('mobile');if(width===768)await screenshot('tablet');
   report.cases.push({engine,case:'responsive',width,height,state:'PASS'});
  }
  await page.getByRole('button',{name:'Encerrar esta prévia',exact:true}).click();await page.getByText('Prévia encerrada. Recibo guardado; ficheiros preservados.').waitFor();
  await page.getByRole('button',{name:'Encerrar bancada',exact:true}).click();await app.closed;
  assert.equal(JSON.parse(fs.readFileSync(app.record+'.stopped.json')).state,'STOPPED');
  report.cases.push({engine,case:'owned-preview-and-service-stop-receipt',state:'PASS'});
 }catch(error){report.errors.push({engine,message:error.message});process.exitCode=1;}
 finally{if(browser)await browser.close();if(app)await app.stop();}
}
report.finishedAt=new Date().toISOString();report.state=report.errors.length||report.externalAttempts.length?'FAIL':'PASS';
fs.writeFileSync(path.join(evidence,'QA.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
