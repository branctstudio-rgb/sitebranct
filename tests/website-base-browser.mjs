// Local QA of the generated references only. Never installs, downloads or publishes.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
assert.ok(process.env.WEBSITE_PLAYWRIGHT_ROOT,'already-installed Playwright root required');
const require=createRequire(path.resolve(process.env.WEBSITE_PLAYWRIGHT_ROOT,'package.json'));
const pw=require('playwright');assert.equal(require('playwright/package.json').version,'1.62.0');
const [sitesArg,outArg]=process.argv.slice(2);assert.ok(sitesArg&&outArg,'usage: REFERENCES_ROOT NEW_REPORT_DIR');
const sites=path.resolve(sitesArg),out=path.resolve(outArg);assert.ok(!fs.existsSync(out),'new report directory required');fs.mkdirSync(out);fs.mkdirSync(path.join(out,'screenshots'));
const head=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={head,runId:process.env.WEBSITE_RUN_ID||null,referenceManifests:{},playwright:'1.62.0',startedAt:new Date().toISOString(),scope:'generated synthetic references32 only',engines:[],cases:[],screenshots:[],externalAttempts:[],errors:[],toolingDiagnostics:[],cleanup:[]};
const files=new Map();
for(const id of ['cedro','linha']){
 const manifestBytes=fs.readFileSync(path.join(sites,id,'manifest.json'));
 report.referenceManifests[id]=sha(manifestBytes);const manifest=JSON.parse(manifestBytes);
 for(const f of manifest.files){const b=fs.readFileSync(path.join(sites,id,f.path));assert.equal(sha(b),f.sha256);files.set(`/${id}/${f.path}`,b);}
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain','.xml':'application/xml'};
const served=[];
const server=http.createServer((req,res)=>{
 const p=req.url?.split('?')[0];const b=files.get(p);served.push({path:p,status:b?200:404});
 if(!b){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':mime[path.extname(p)]||'application/octet-stream','content-length':b.length,'x-dns-prefetch-control':'off','cache-control':'no-store'});res.end(b);
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin=`http://127.0.0.1:${server.address().port}`;
const viewports=[[320,568],[360,800],[390,844],[768,1024],[1024,768],[1440,900]];
let capturePage=null;
const blockedScreenshotStyle="Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.";
async function screenshot(page,name){try{capturePage=page;const b=await page.screenshot({path:path.join(out,'screenshots',name),fullPage:true,caret:'initial'});report.screenshots.push({file:'screenshots/'+name,head,sha256:sha(b),bytes:b.length});}finally{capturePage=null;}}
async function geometry(page){return page.evaluate(()=>{
 const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility==='visible';
 const interactive=[...document.querySelectorAll('a,button')].filter(visible).filter(e=>!e.classList.contains('skip-link'));
 const bad=interactive.map(e=>({label:e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})).filter(r=>r.width<43.9||r.height<43.9);
 const lum=c=>{const v=c.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
 const contrasts=[...document.querySelectorAll('h1,h2,h3,p,a,button,figcaption')].filter(visible).filter(e=>e.textContent.trim()).map(e=>{
  let parent=e,bg;while(parent){bg=getComputedStyle(parent).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')break;parent=parent.parentElement;}
  const a=lum(getComputedStyle(e).color),b=lum(bg||'rgb(255,255,255)');return{label:e.textContent.trim().slice(0,65),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
 });
 return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,invalidTargets:bad,contrastFailures:contrasts.filter(c=>c.ratio<4.5),font:getComputedStyle(document.body).fontFamily};
});}
try{
 for(const engine of (process.env.WEBSITE_ENGINES||'chromium,firefox,webkit').split(',')){
  let browser;try{const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','PATH','USERPROFILE','LOCALAPPDATA','HOME','TMPDIR','XDG_CACHE_HOME'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));browser=await pw[engine].launch({headless:true,env});}
  catch(e){report.engines.push({engine,status:'NOT_VERIFIED',error:e.message});continue;}
  const engineRecord={engine,status:'EXECUTED',version:browser.version()};report.engines.push(engineRecord);
  try{for(const id of ['cedro','linha'])for(const [width,height]of viewports){
   const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'});
   const events=[];await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==origin){report.externalAttempts.push({engine,id,width,url:route.request().url()});return route.abort();}await route.continue();});
   const page=await context.newPage();page.on('pageerror',e=>events.push(e.message));page.on('console',m=>{if(m.type()==='error'){if(capturePage===page&&m.text()===blockedScreenshotStyle){report.toolingDiagnostics.push({engine,id,width,phase:'playwright-screenshot',message:m.text(),classification:'CSP correctly rejected screenshotter syncAnimations style; not suppressed'});}else events.push(m.text());}});
   try{for(const route of ['index.html','contacto.html']){
    const item={engine,id,route,width,height,status:'RUNNING'};report.cases.push(item);
    try{
     const response=await page.goto(`${origin}/${id}/${route}`,{waitUntil:'load',timeout:15000});assert.equal(response.status(),200);await page.evaluate(()=>document.fonts.ready);
     assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('main').count(),1);
     const expectedName=id==='cedro'?'Ateliê Cedro':'Estúdio Linha';assert.ok((await page.title()).includes(expectedName));
     const ld=await page.locator('script[type="application/ld+json"]').textContent();assert.equal(JSON.parse(ld).name,expectedName);
     assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'),'noindex, nofollow');
     const broken=await page.evaluate(()=>[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src));assert.deepEqual(broken,[]);
     const links=await page.locator('a').evaluateAll(es=>es.map(e=>e.getAttribute('href')));for(const href of links){assert.ok(/^#|^(index|contacto)\.html(?:#abordagem)?$/.test(href),href);}
     item.geometry=await geometry(page);assert.ok(item.geometry.scrollWidth<=width,JSON.stringify(item.geometry));assert.deepEqual(item.geometry.invalidTargets,[]);assert.deepEqual(item.geometry.contrastFailures,[]);
     await page.keyboard.press('Tab');assert.equal(await page.locator('.skip-link').evaluate(e=>document.activeElement===e),true);assert.notEqual(await page.locator('.skip-link').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
     await page.keyboard.press('Enter');assert.equal(await page.locator('main').evaluate(e=>document.activeElement===e),true);
     if(width<=900){
      const toggle=page.locator('.mobile-toggle'),close=page.locator('.drawer-close');
      await toggle.click();await close.waitFor({state:'visible'});await page.waitForFunction(()=>document.activeElement?.classList.contains('drawer-close'));
      assert.equal(await toggle.getAttribute('aria-expanded'),'true');assert.equal(await page.locator('main').evaluate(e=>e.inert),true);assert.equal(await page.locator('.footer').evaluate(e=>e.inert),true);assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
      const rect=await page.locator('.mobile-drawer').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width&&rect.y>=0&&rect.height<=height);
      await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('.mobile-drawer a').last().evaluate(e=>document.activeElement===e),true);await page.keyboard.press('Tab');assert.equal(await close.evaluate(e=>document.activeElement===e),true);
      if(width===390&&route==='index.html')await screenshot(page,`${engine}-${id}-${width}-menu.png`);
      await page.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await toggle.evaluate(e=>document.activeElement===e),true);assert.equal(await page.locator('main').evaluate(e=>e.inert),false);
      await toggle.click();await close.click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');
      await toggle.click();await page.locator('.drawer-overlay').click({position:{x:2,y:height/2}});assert.equal(await toggle.getAttribute('aria-expanded'),'false');
      await toggle.click();await page.setViewportSize({width:1440,height:900});await page.waitForFunction(()=>document.querySelector('.mobile-toggle').getAttribute('aria-expanded')==='false');assert.equal(await page.locator('main').evaluate(e=>e.inert),false);await page.setViewportSize({width,height});
      item.drawer='button,Escape,backdrop,initial/trap/return focus,inert,scroll lock,resize PASS';
     }
     assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
     assert.equal(await page.locator('.mobile-drawer').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
     if((route==='index.html'&&[390,768,1440].includes(width))||(route==='contacto.html'&&[390,1440].includes(width)))await screenshot(page,`${engine}-${id}-${width}-${route.replace('.html','')}.png`);
     if(route==='index.html'){const contact=width>900?page.locator('.desktop-nav a[href="contacto.html"]'):page.locator('.hero a[href="contacto.html"]');await contact.click();await page.waitForURL(`**/${id}/contacto.html`);assert.equal(await page.locator('h1').count(),1);}
     assert.deepEqual(events,[]);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
     item.status='PASS';
    }catch(e){item.status='FAIL';item.error=e.stack;report.errors.push({engine,id,width,route,message:e.message});}
   }}finally{await context.close();}
  }}catch(e){engineRecord.status='NOT_VERIFIED';engineRecord.error=e.stack;}
  finally{await browser.close();report.cleanup.push({engine,browserClosed:!browser.isConnected()});}
 }
}finally{
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 report.cleanup.push({serverListening:server.listening});report.served=served;report.finishedAt=new Date().toISOString();
 report.state=report.errors.length||report.externalAttempts.length||served.some(x=>x.status!==200)?'FAIL':report.engines.some(x=>x.status==='NOT_VERIFIED')?'PARTIAL':'PASS';
 fs.writeFileSync(path.join(out,'QA.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({state:report.state,head,cases:report.cases.length,passed:report.cases.filter(c=>c.status==='PASS').length,engines:report.engines,errors:report.errors,cleanup:report.cleanup}));
 if(report.state!=='PASS')process.exitCode=1;
}
