import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {startStudio} from '../fixtures/website-project/studio/server.mjs';
import {createHash} from 'node:crypto';
import {syntheticPNG} from './website-studio-fixtures.mjs';
const [out,runtime,engines='chromium,firefox,webkit']=process.argv.slice(2);assert.ok(path.isAbsolute(out)&&!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
const require=createRequire(path.join(runtime,'package.json')),pw=require('playwright');
const report={mission:'WEBSITE45',state:'RUNNING',playwright:require('playwright/package.json').version,cases:[],screenshots:[],errors:[],external:[]};
for(const engine of engines.split(',')){
 let app,browser;try{
  const dir=path.join(out,engine);fs.mkdirSync(dir);const root=path.join(dir,'projects');fs.mkdirSync(root);app=await startStudio(root);
  const s=await (await fetch(app.url+'/api/state')).json();assert.equal((await fetch(app.url+'/api/generate',{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-studio-token':s.token},body:JSON.stringify({name:'v1',recipe:s.recipe})})).status,201);
  browser=await pw[engine].launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await context.route('**/*',r=>{if(new URL(r.request().url()).hostname!=='127.0.0.1'){report.external.push(r.request().url());return r.abort();}return r.continue();});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push({engine,error:e.message}));await page.goto(app.url);
  const button=page.getByRole('button',{name:'Preparar entrega',exact:true});await button.waitFor({timeout:3000});await page.getByLabel('Título principal',{exact:true}).fill('Edição pendente NÃO incluída');
  await button.focus();await page.keyboard.press('Enter');await page.getByRole('heading',{name:'v1 · entrega estática verificada',exact:true}).waitFor();
  await page.waitForFunction(()=>document.activeElement.id==='delivery-result');assert.equal(await page.getByLabel('Título principal',{exact:true}).inputValue(),'Edição pendente NÃO incluída');
  assert.ok(!fs.readFileSync(path.join(root,'deliveries/v1/site/index.html'),'utf8').includes('Edição pendente'));
  for(const label of ['Abrir início da entrega ↗','Abrir contacto da entrega ↗']){const url=await page.getByRole('link',{name:label,exact:true}).getAttribute('href');const preview=await context.newPage();await preview.goto(url);assert.ok((await preview.locator('meta[name="robots"]').getAttribute('content')).includes('noindex'));await preview.close();}
  for(const [width,height] of [[1440,900],[1024,768],[768,1024],[390,844],[360,800]]){
   await page.setViewportSize({width,height});await page.locator('#delivery-result').scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.deepEqual(await page.locator('#delivery-result a,#delivery-result button').evaluateAll(ns=>ns.filter(n=>{const r=n.getBoundingClientRect();return r.width<44||r.height<44;}).map(n=>n.textContent)),[]);
   if(width===1440||width===390){const image=path.join(dir,'delivery-'+width+'.png');await page.screenshot({path:image});report.screenshots.push(image);}report.cases.push({engine,width,height,state:'PASS'});
  }
  await page.getByRole('button',{name:'Encerrar prévia da entrega',exact:true}).click();await page.locator('#delivery-result').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Abrir entrega',exact:true}).click();await page.getByRole('heading',{name:'v1 · entrega estática verificada',exact:true}).waitFor();
  fs.appendFileSync(path.join(root,'deliveries/v1/site/index.html'),'test-only alteration');await page.getByRole('button',{name:'Abrir entrega',exact:true}).click();await page.waitForFunction(()=>document.getElementById('status').dataset.state==='error'&&document.activeElement.id==='status');
  assert.match(await page.locator('#status').textContent(),/hash|bytes/);
  // A new transport error must replace the old field/delivery error, not mask it.
  await page.route('**/api/validate',route=>route.abort());
  await page.getByRole('button',{name:'Validar receita',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('recipe-form').hasAttribute('aria-busy'));
  assert.match(await page.locator('#status').textContent(),/ligação|conexão|concluir/i);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'status');
  await page.unroute('**/api/validate');
  await page.getByRole('button',{name:'Validar receita',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Receita válida'));
  page.once('dialog',dialog=>dialog.dismiss());
  await page.getByRole('button',{name:'Encerrar bancada',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('recipe-form').hasAttribute('aria-busy'));
  assert.doesNotMatch(await page.locator('#status').textContent(),/A processar/,'cancelled action must not leave a processing announcement');
  assert.equal((await fetch(app.url+'/api/state')).status,200,'cancel keeps the owned service active');
  report.cases.push({engine,version:browser.version(),case:'keyboard-prepare-exact-saved-version-open-close-reopen-tamper-error',state:'PASS'});
 }catch(error){report.errors.push({engine,error:error.stack});process.exitCode=1;}finally{if(browser)await browser.close();if(app)await app.stop();}
}
report.state=report.errors.length||report.external.length?'FAIL':'PASS';fs.writeFileSync(path.join(out,'QA.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));

// Revision journey uses a separate fresh synthetic project, never operator data.
{
const [,runtime,engines='chromium,firefox,webkit']=process.argv.slice(2);
const out=path.join(process.argv[2],'revisions');
assert.ok(path.isAbsolute(out)&&!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
const require=createRequire(path.join(runtime,'package.json')),pw=require('playwright');
const report={state:'RUNNING',playwright:require('playwright/package.json').version,cases:[],errors:[],external:[],screenshots:[]};
function snapshot(dir){return Object.fromEntries(fs.readdirSync(dir,{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>{const file=path.join(e.parentPath,e.name);return [path.relative(dir,file),createHash('sha256').update(fs.readFileSync(file)).digest('hex')];}));}
for(const engine of engines.split(',')){
 let app,browser;try{
  const dir=path.join(out,engine);fs.mkdirSync(dir);const root=path.join(dir,'projects');fs.mkdirSync(root);app=await startStudio(root);
  const state=await(await fetch(app.url+'/api/state')).json();
  const post=(route,body)=>fetch(app.url+'/api/'+route,{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-studio-token':state.token},body:JSON.stringify(body)});
  const recipe=structuredClone(state.recipe);recipe.content.headline='Primeira proposta fictícia';
  assert.equal((await post('generate',{name:'v1',recipe})).status,201);
  assert.equal((await post('prepare-delivery',{name:'v1'})).status,201);
  const v1=snapshot(path.join(root,'revisions/v1')),delivery1=snapshot(path.join(root,'deliveries/v1'));
  browser=await pw[engine].launch();const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='127.0.0.1'&&!(u.protocol==='blob:'&&u.origin===app.url)){report.external.push(u.href);return r.abort();}return r.continue();});
  const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>report.errors.push({engine,error:e.message}));
  await page.goto(app.url);await page.getByRole('button',{name:'Abrir entrega',exact:true}).click();
  await page.getByRole('heading',{name:'v1 · entrega estática verificada',exact:true}).waitFor();
  await page.getByRole('button',{name:'Reabrir receita',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('content.headline').value==='Primeira proposta fictícia');
  const missing=[];
  if(await page.locator('#version-name').inputValue()!=='v2')missing.push('reopening v1 does not offer unused v2');
  if(await page.locator('#editor-state').count()!==1)missing.push('no persistent editor/saved state');
  if(await page.getByRole('button',{name:'Conferir antes e depois',exact:true}).count()!==1)missing.push('no saved-version comparison');
  assert.deepEqual(missing,[]);
  await page.getByLabel('Título principal',{exact:true}).fill('Segunda proposta fictícia');
  await page.getByLabel('Usar como',{exact:true}).selectOption('hero');
  await page.locator('#import-file').setInputFiles({name:'revision.png',mimeType:'image/png',buffer:syntheticPNG(320,160,[130,65,80])});
  await page.waitForFunction(()=>!document.getElementById('import-confirm').disabled);await page.locator('#import-confirm').click();
  await page.waitForFunction(()=>document.getElementById('import-status').textContent.startsWith('Recurso importado'));
  await page.getByLabel('Descrição acessível da imagem',{exact:true}).fill('Ilustração geométrica fictícia da segunda versão');
  assert.match(await page.locator('#editor-state').textContent(),/por guardar/);
  await page.getByRole('button',{name:'Abrir entrega',exact:true}).click();
  await page.getByRole('heading',{name:'v1 · entrega estática verificada',exact:true}).waitFor();
  assert.match(await page.locator('#editor-state').textContent(),/por guardar/);
  assert.equal(await page.locator('#content\\.headline').inputValue(),'Segunda proposta fictícia');
  await page.locator('#save').click();await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Receita v2 guardada'));
  assert.match(await page.locator('#editor-state').textContent(),/Sem alterações por guardar/);
  assert.equal(await page.locator('#editor-state').getAttribute('data-pending'),'false');
  await page.locator('#generate').click();await page.getByRole('heading',{name:'v2 · pronto a experimentar',exact:true}).waitFor();
  const v2row=page.locator('.revision').filter({has:page.getByText('v2',{exact:true})});
  await v2row.getByRole('button',{name:'Preparar entrega',exact:true}).click();await page.getByRole('heading',{name:'v2 · entrega estática verificada',exact:true}).waitFor();
  await page.getByLabel('Antes · versão guardada',{exact:true}).selectOption('v1');
  await page.getByLabel('Depois · versão guardada',{exact:true}).selectOption('v2');
  await page.getByRole('button',{name:'Conferir antes e depois',exact:true}).click();
  await page.getByRole('heading',{name:'v1 → v2 · versões guardadas',exact:true}).waitFor();
  const comparison=page.locator('#comparison-result');assert.match(await comparison.textContent(),/Título principal/);assert.match(await comparison.textContent(),/Imagem principal/);
  assert.doesNotMatch(await comparison.textContent(),/undefined/,'legacy optional values need an operator-readable label');
  for(const [label,title] of [['Antes · v1 · início','Primeira proposta fictícia'],['Depois · v2 · início','Segunda proposta fictícia']]){
   const preview=await context.newPage();await preview.goto(await page.getByRole('link',{name:label,exact:true}).getAttribute('href'));
   assert.equal(await preview.locator('h1').textContent(),title);assert.equal(await preview.locator('img').evaluateAll(ns=>ns.every(n=>n.complete&&n.naturalWidth>0)),true);await preview.close();
  }
  for(const [width,height] of [[1440,900],[1024,768],[768,1024],[390,844],[360,800]]){
   await page.setViewportSize({width,height});await comparison.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.deepEqual(await comparison.locator('a,button').evaluateAll(ns=>ns.filter(n=>{const r=n.getBoundingClientRect();return r.width<44||r.height<44;}).map(n=>n.textContent)),[]);
   if(width===1440||width===390){const image=path.join(dir,'revisions-'+width+'.png');await page.screenshot({path:image});report.screenshots.push(image);}report.cases.push({engine,width,height,state:'PASS'});
  }
  const alreadyOpen=await page.getByRole('link',{name:'Depois · v2 · início',exact:true}).getAttribute('href');
  await comparison.getByRole('button').click();
  await comparison.waitFor({state:'hidden'});
  assert.equal((await fetch(alreadyOpen)).status,200,'closing comparison must not terminate an already shared revision preview');
  await page.getByLabel('Antes · versão guardada',{exact:true}).selectOption('v2');await page.getByRole('button',{name:'Conferir antes e depois',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('status').dataset.state==='error');assert.match(await page.locator('#status').textContent(),/diferentes/);
  await v2row.getByRole('button',{name:'Reabrir receita',exact:true}).click();await page.waitForFunction(()=>document.getElementById('version-name').value==='v3');
  await page.getByLabel('Título principal',{exact:true}).fill('Alteração abandonada');
  page.once('dialog',d=>d.dismiss());await page.locator('.revision').filter({has:page.getByText('v1',{exact:true})}).getByRole('button',{name:'Reabrir receita',exact:true}).click();
  assert.equal(await page.getByLabel('Título principal',{exact:true}).inputValue(),'Alteração abandonada');
  assert.deepEqual(snapshot(path.join(root,'revisions/v1')),v1);assert.deepEqual(snapshot(path.join(root,'deliveries/v1')),delivery1);
  assert.match(fs.readFileSync(path.join(root,'deliveries/v2/site/index.html'),'utf8'),/Segunda proposta fictícia/);
  assert.ok(!fs.readFileSync(path.join(root,'deliveries/v2/site/index.html'),'utf8').includes('Alteração abandonada'));
  report.cases.push({engine,version:browser.version(),case:'reopen-v1-edit-text-image-save-v2-compare-deliver-preserve-v1',state:'PASS'});
 }catch(error){report.errors.push({engine,error:error.stack});process.exitCode=1;}finally{if(browser)await browser.close();if(app)await app.stop();}
}
report.state=report.errors.length||report.external.length?'FAIL':'PASS';fs.writeFileSync(path.join(out,'QA.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
}
