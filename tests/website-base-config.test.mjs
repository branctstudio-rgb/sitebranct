import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

// Focal local browser proof, not a substitute for the pinned F2-01 full matrix.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
assert.ok(process.env.WEBSITE_PLAYWRIGHT_ROOT,'Provide an already-installed Playwright root; this test never installs');
const require=createRequire(path.resolve(process.env.WEBSITE_PLAYWRIGHT_ROOT,'package.json'));
const pw=require('playwright');
assert.equal(require('playwright/package.json').version,'1.62.0');
const client=JSON.parse(fs.readFileSync(path.join(root,'fixtures/website-base/client-synthetic.json')));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'deploy/publish-manifest.json'))).files;
const files=new Map(manifest.map(f=>[f,fs.readFileSync(path.join(root,f))]));
const css=fs.readFileSync(path.join(root,'src/css/branct.css'),'utf8');
const crm=files.get('crm-gestao.html').toString();
const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function fixture(label,existing=false){
 const data=label===null?'':` data-close-label="${escape(label)}"`;
 return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Synthetic identity</title><style>${css}</style><style>:root{${Object.entries(client.tokens).map(([k,v])=>`${k}:${v}`).join(';')}}body{font-family:${client.bodyFont}}</style><body><header class="header"><a class="logo" href="#main">${client.displayName}</a><button class="mobile-toggle" aria-controls="drawer" aria-label="Open navigation"><span></span><span></span></button></header><nav id="drawer" class="mobile-drawer"${data}>${existing?'<button class="drawer-close" aria-label="Existing client label">×</button>':''}<a href="#main">Overview</a><a href="#footer">Contact</a></nav><div class="drawer-overlay"></div><main id="main"><h1>Content belongs to this client</h1><button>Local action</button></main><footer id="footer" class="footer">Synthetic footer</footer><script src="src/js/branct.js"></script></body></html>`;
}
const cases=[['custom','Close navigation',false,'Close navigation'],['default',null,false,'Fechar menu'],['blank','   ',false,'Fechar menu'],['literal','Close <navigation>',false,'Close <navigation>'],['existing','Not an override',true,'Existing client label']];
for(const [id,label,existing]of cases)files.set(`fixture-${id}.html`,Buffer.from(fixture(label,existing)));
files.set('fixture-crm.html',Buffer.from(crm.replace('class="mobile-drawer"','class="mobile-drawer" data-close-label="Close product navigation"')));
// The fixture invokes the real boot, but no client translation or form endpoint.
files.set('src/i18n/pt.json',Buffer.from('{}'));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.woff2':'font/woff2','.webm':'video/webm','.mp4':'video/mp4','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
const csp="default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self'; frame-src 'none'; worker-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
const report=[];
test('Reusable drawer label preserves identity and modal behavior in actual browsers',async(t)=>{
 const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://local').pathname.slice(1)||'index.html';
  if(!files.has(p)){res.writeHead(404);return res.end();}
  const b=files.get(p);res.writeHead(200,{'content-type':mime[path.extname(p)]||'application/octet-stream','content-length':b.length,'content-security-policy':csp,'x-dns-prefetch-control':'off'});res.end(b);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 try {for(const engine of (process.env.WEBSITE_ENGINES||'chromium,firefox,webkit').split(',')){
  await t.test(engine,async(t)=>{
   const env=Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','PATH','USERPROFILE','LOCALAPPDATA'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
   const browser=await pw[engine].launch({headless:true,env});
   try {for(const [id,, ,expected]of [...cases,['crm',null,false,'Close product navigation']]){
    await t.test(id,async()=>{
     const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block',permissions:[]});
     const attempts=[],errors=[];
     await context.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){attempts.push(r.request().resourceType());return r.abort('blockedbyclient');}return r.continue();});
     await context.routeWebSocket('**/*',s=>{attempts.push('websocket');s.close();});
     const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
     try {
      await page.goto(`${origin}/fixture-${id}.html`,{waitUntil:'domcontentloaded',timeout:10000});
      const toggle=page.locator('.mobile-toggle');await toggle.focus();await page.keyboard.press('Enter');
      await page.waitForFunction(()=>document.activeElement===document.querySelector('.drawer-close'));
      assert.equal(await page.locator('.drawer-close').getAttribute('aria-label'),expected);
      assert.equal(await page.locator('.drawer-close navigation').count(),0,'label must never become HTML');
      assert.equal(await toggle.getAttribute('aria-expanded'),'true');
      assert.equal(await page.evaluate(()=>document.querySelector('main').inert&&document.body.style.overflow==='hidden'),true);
      await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.mobile-drawer')),true);
      await page.keyboard.press('Tab');await page.keyboard.press('Escape');
      assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('.mobile-toggle')&&!document.querySelector('main').inert),true);
      if(id!=='crm'){
       assert.equal(await page.locator('.logo').textContent(),'Studio Example');
       assert.equal(await page.locator('h1').textContent(),'Content belongs to this client');
       assert.equal(await page.evaluate(()=>getComputedStyle(document.body).fontFamily),'Georgia, serif');
       assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()),'#59358c');
      }
      assert.deepEqual(attempts,[]);assert.deepEqual(errors,[]);
      report.push({engine,version:browser.version(),case:id,status:'PASS',attempts:0});
     } catch(e){report.push({engine,case:id,status:e.name==='TimeoutError'?'INCONCLUSIVE':'FAIL',error:e.message});throw e;}finally{await context.close();}
    });
   }}finally{await browser.close();}
  });
 }}finally{server.closeAllConnections();await new Promise(r=>server.close(r));if(process.env.WEBSITE_REPORT)fs.writeFileSync(process.env.WEBSITE_REPORT,JSON.stringify({scope:'Synthetic identity and real CRM label; existing engines only; no canonical matrix substitution',report},null,2)+'\n');}
});
