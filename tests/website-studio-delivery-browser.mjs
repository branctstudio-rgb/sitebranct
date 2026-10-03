import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {startStudio} from '../fixtures/website-project/studio/server.mjs';
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
  report.cases.push({engine,version:browser.version(),case:'keyboard-prepare-exact-saved-version-open-close-reopen-tamper-error',state:'PASS'});
 }catch(error){report.errors.push({engine,error:error.stack});process.exitCode=1;}finally{if(browser)await browser.close();if(app)await app.stop();}
}
report.state=report.errors.length||report.external.length?'FAIL':'PASS';fs.writeFileSync(path.join(out,'QA.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report,null,2));
