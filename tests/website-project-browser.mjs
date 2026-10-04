// Focal local QA. Uses an explicitly supplied, already installed Playwright; never installs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readRecipe,sha256,noLinks} from '../fixtures/website-project/project.mjs';
import {serve} from '../fixtures/website-project/preview.mjs';

const [recipe,destination,evidence,packageRoot]=process.argv.slice(2);
assert.ok(recipe&&destination&&evidence&&packageRoot,'Usage: node tests/website-project-browser.mjs RECIPE OUTPUT NEW_EVIDENCE EXISTING_PLAYWRIGHT_ROOT');
assert.ok(path.isAbsolute(evidence)&&!fs.existsSync(evidence),'new absolute evidence directory required');noLinks(path.dirname(evidence));
const require=createRequire(path.join(path.resolve(packageRoot),'package.json'));
const playwright=require('playwright');
const {config}=readRecipe(recipe);
fs.mkdirSync(evidence);
const report={mission:'WEBSITE38',mode:'LOCAL_INSTALLED_PLAYWRIGHT',startedAt:new Date().toISOString(),playwright:require('playwright/package.json').version,recipe:path.resolve(recipe),destination:path.resolve(destination),manifestSha256:sha256(fs.readFileSync(path.join(destination,'manifest.json'))),engines:[],cases:[],toolingDiagnostics:[],errors:[],externalAttempts:[],screenshots:[],cleanup:{}};
const {server,info}=await serve(recipe,destination,path.join(evidence,'server.json'));
const origin=`http://127.0.0.1:${info.port}`;
let capturing=false;
const capture=async(page,file,fullPage=true)=>{try{capturing=true;await page.screenshot({path:file,fullPage,caret:'initial'});}finally{capturing=false;}};
const viewports=[[360,800],[390,844],[768,1024],[1024,768],[1440,900]];
try {
  for(const engine of ['chromium','firefox','webkit']) {
    let browser;
    try { browser=await playwright[engine].launch({headless:true}); }
    catch(error){report.engines.push({engine,state:'UNAVAILABLE',error:error.message});continue;}
    report.engines.push({engine,state:'EXECUTED',version:browser.version()});
    try {
      const context=await browser.newContext({reducedMotion:'reduce'});
      await context.route('**/*',route=>{
        if(!route.request().url().startsWith(origin+'/')) {report.externalAttempts.push(route.request().url());return route.abort();}
        return route.continue();
      });
      const page=await context.newPage();
      page.on('pageerror',error=>report.errors.push({engine,type:'pageerror',error:error.message}));
      page.on('console',message=>{if(message.type()==='error'){if(capturing&&message.text()==="Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive of the Content Security Policy.")report.toolingDiagnostics.push({engine,phase:'playwright-screenshot',error:message.text(),classification:'CSP correctly rejected screenshotter syncAnimations style'});else report.errors.push({engine,type:'console',error:message.text()});}});
      page.on('response',response=>{if(response.status()>=400)report.errors.push({engine,type:'http',status:response.status(),url:response.url()});});
      for(const [width,height] of viewports)for(const route of Object.values(config.routes)) {
        const result={engine,route,width,height,state:'FAIL'};
        try {
          await page.setViewportSize({width,height});
          const response=await page.goto(origin+'/'+route);assert.equal(response.status(),200);
          await page.evaluate(()=>document.fonts.ready);
          const dom=await page.evaluate(()=>({
            overflow:document.documentElement.scrollWidth>innerWidth,
            h1:document.querySelectorAll('h1').length,
            images:[...document.images].every(image=>image.complete&&image.naturalWidth>0),
            canonical:document.querySelector('link[rel=canonical]').href,
            robots:document.querySelector('meta[name=robots]').content,
            description:document.querySelector('meta[name=description]').content,
            schema:JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent),
            links:[...document.querySelectorAll('a')].map(a=>a.getAttribute('href')),
            targets:[...document.querySelectorAll('a,button')].filter(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return s.display!=='none'&&s.visibility==='visible'&&r.width&&r.height&&r.top>=0&&r.bottom<=innerHeight;}).map(el=>({text:el.textContent.trim(),w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})),
            fonts:document.fonts.status
          }));
          assert.equal(dom.overflow,false,'horizontal overflow');assert.equal(dom.h1,1);assert.equal(dom.images,true);assert.equal(dom.fonts,'loaded');
          assert.equal(dom.canonical,config.origin+'/'+route);assert.match(dom.robots,/noindex/);assert.equal(dom.schema.url,dom.canonical);assert.equal(dom.schema.description,dom.description);
          assert.ok(dom.targets.every(t=>t.w>=44&&t.h>=44),'small interactive targets');
          for(const href of new Set(dom.links)) {
            const target=new URL(href,origin+'/'+route);assert.equal(target.origin,origin);
            const r=await context.request.get(target.href);assert.equal(r.status(),200,'broken link '+href);
            if(target.hash)assert.ok((await r.text()).includes(`id="${target.hash.slice(1)}"`),'missing anchor '+href);
          }
          if([390,768,1440].includes(width)) {
            const filename=`${engine}-${route.replace('.html','')}-${width}.png`;
            await capture(page,path.join(evidence,filename));
            report.screenshots.push({file:filename,sha256:sha256(fs.readFileSync(path.join(evidence,filename)))});
          }
          await page.keyboard.press('Tab');assert.equal(await page.locator('.skip-link').evaluate(el=>el===document.activeElement),true,'skip link first');
          await page.keyboard.press('Enter');assert.equal(await page.locator('main').evaluate(el=>el===document.activeElement),true,'skip target focus');
          await page.evaluate(()=>window.scrollTo(0,0));
          if(width<=900) {
            await page.locator('.mobile-toggle').click();
            await page.locator('.drawer-close').waitFor({state:'visible'});
            await page.waitForFunction(()=>document.activeElement?.classList.contains('drawer-close'));
            assert.equal(await page.locator('main').evaluate(el=>el.inert),true);
            await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('.mobile-drawer nav a').last().evaluate(el=>el===document.activeElement),true);
            await page.keyboard.press('Tab');assert.equal(await page.locator('.drawer-close').evaluate(el=>el===document.activeElement),true);
            if(width===390&&route===config.routes.home) {
              const filename=`${engine}-drawer-390.png`;await capture(page,path.join(evidence,filename),false);report.screenshots.push({file:filename,sha256:sha256(fs.readFileSync(path.join(evidence,filename)))});
            }
            await page.keyboard.press('Escape');assert.equal(await page.locator('.mobile-toggle').getAttribute('aria-expanded'),'false');
            assert.equal(await page.locator('.mobile-toggle').evaluate(el=>el===document.activeElement),true);
            assert.equal(await page.locator('main').evaluate(el=>el.inert),false);
            await page.locator('.mobile-toggle').click();await page.locator('.drawer-overlay').click({position:{x:2,y:40}});assert.equal(await page.locator('.mobile-toggle').getAttribute('aria-expanded'),'false');
            await page.locator('.mobile-toggle').click();await page.locator('.mobile-drawer nav a').last().click();await page.waitForURL(origin+'/'+config.routes.contact);
            assert.equal(await page.locator('h1').innerText(),config.content.contactTitle);
          } else {
            await page.locator('.desktop-nav a').last().click();await page.waitForURL(origin+'/'+config.routes.contact);
          }
          result.state='PASS';result.checks=['assets','fonts','links/anchors','no-overflow','44px-targets','SEO/schema','keyboard/skip','navigation','drawer/focus/Escape/overlay'];
        }catch(error){result.error=error.message;}
        report.cases.push(result);
      }
      await context.close();
    }finally{await browser.close();report.cleanup[engine]='closed';}
  }
}finally{
  await new Promise(resolve=>server.close(resolve));report.cleanup.server='closed';report.finishedAt=new Date().toISOString();
  report.state=report.cases.length===30&&report.cases.every(c=>c.state==='PASS')&&!report.errors.length&&!report.externalAttempts.length?'PASS':'INCOMPLETE_OR_FAIL';
  fs.writeFileSync(path.join(evidence,'QA.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({state:report.state,cases:report.cases.length,passed:report.cases.filter(c=>c.state==='PASS').length,engines:report.engines,errors:report.errors,screenshots:report.screenshots.length,report:path.join(evidence,'QA.json')},null,2));
  if(report.state!=='PASS')process.exitCode=1;
}
