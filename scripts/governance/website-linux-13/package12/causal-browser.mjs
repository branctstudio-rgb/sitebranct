// Bounded A/B only. No production files, altered assertion or extended deadline.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
const root=path.resolve(process.env.CANDIDATE_ROOT||'work/sitebranct-website-contracts-09');
const out=path.resolve(process.env.PROBE_OUTPUT||path.dirname(fileURLToPath(import.meta.url)));
const require=createRequire(path.join(root,'package.json')),pw=require('playwright');
assert.equal(require('playwright/package.json').version,'1.62.0');
const {startTrustedStaticServer}=await import(pathToFileURL(path.join(root,'scripts/governance/f2-gov-08-static-server.mjs')));
const sha=b=>createHash('sha256').update(b).digest('hex');
const fixture=path.join(out,'causal-fixture');fs.mkdirSync(path.join(fixture,'media'),{recursive:true});
const media=fs.readFileSync(path.join(root,'src/img/crm-demo.webm'));
const html=Buffer.from('<!doctype html><video id="media" preload="metadata" src="/media/fixture.webm"></video>');
fs.writeFileSync(path.join(fixture,'index.html'),html);fs.writeFileSync(path.join(fixture,'media/fixture.webm'),media);
const records=[];
async function isolate(page,origin,events){
 await page.context().route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){events.push({kind:'externalBlocked',url:r.request().url()});return r.abort('blockedbyclient');}return r.continue();});
 await page.context().routeWebSocket('**/*',s=>{events.push({kind:'socketBlocked',url:s.url()});s.close();});
}
async function chromiumProbe(args){
 const options={headless:true,args};const browser=await pw.chromium.launch(options);
 const page=await browser.newPage({viewport:{width:320,height:568},serviceWorkers:'block',permissions:[]});
 const r={engine:'chromium',version:browser.version(),options,context:'newPage',deadline:2500,samples:[],events:[]};
 try{
  await isolate(page,'http://127.0.0.1:1',r.events);await page.bringToFront();
  await page.setContent('<style>.mobile-drawer{position:fixed;left:20px;top:0;width:200px;height:300px;transform:translateX(320px);transition:transform 450ms linear}</style><nav class="mobile-drawer"><button id="inside">Inside</button></nav>');
  await page.locator('#inside').focus();
  r.before=await page.evaluate(()=>({left:document.querySelector('.mobile-drawer').getBoundingClientRect().left,focused:document.hasFocus(),visibility:document.visibilityState,timeOrigin:performance.timeOrigin}));assert.ok(r.before.left>320);
  await page.evaluate(()=>document.querySelector('.mobile-drawer').style.transform='translateX(0)');
  const start=performance.now(),deadline=start+2500;let previous;
  while(performance.now()<deadline){let timer;
   const sample=await Promise.race([page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(raf=>{const d=document.querySelector('.mobile-drawer'),b=d.getBoundingClientRect();resolve({raf,perf:performance.now(),wall:Date.now(),timeline:document.timeline.currentTime,rect:[b.left,b.right,b.top,b.bottom],active:d.getAnimations().some(a=>a.pending||a.playState==='running'),animations:d.getAnimations().map(a=>({time:a.currentTime,state:a.playState})),focus:d.contains(document.activeElement)});}))),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RAF deadline 2500ms')),Math.max(0,deadline-performance.now()));})]).finally(()=>clearTimeout(timer));
   r.samples.push({...sample,hostElapsed:performance.now()-start});
   if(performance.now()>=deadline)throw Error('RAF deadline 2500ms');
   if(previous&&!sample.active&&sample.rect.every((v,i)=>Math.abs(v-previous[i])<.01)){
    assert.ok(sample.rect[0]>=-.5&&sample.rect[1]<=320.5);assert.equal(sample.focus,true);r.result='PASS';break;
   }previous=sample.rect;
  }r.result??='INCONCLUSIVE';
 }catch(e){r.result='INCONCLUSIVE';r.error=e.message;}finally{await browser.close();records.push(r);}
}
async function webkitProbe(explicit){
 const server=await startTrustedStaticServer(fixture,[{path:'index.html',sha256:sha(html)},{path:'media/fixture.webm',sha256:sha(media)}],0);
 const browser=await pw.webkit.launch({headless:true});
 const options={viewport:{width:1280,height:720},serviceWorkers:'block',permissions:[]};
 const page=explicit?await(await browser.newContext(options)).newPage():await browser.newPage(options);
 const r={engine:'webkit',version:browser.version(),options:{headless:true},context:explicit?'newContext.newPage':'newPage',deadline:30000,mediaSha256:sha(media),events:[]};
 const stamp=()=>({utc:new Date().toISOString(),monotonic:performance.now()});
 try{
  await isolate(page,server.origin,r.events);
  for(const kind of ['request','requestfinished','requestfailed'])page.on(kind,q=>r.events.push({kind,...stamp(),url:q.url(),failure:q.failure(),range:q.headers().range??null}));
  page.on('response',q=>r.events.push({kind:'response',...stamp(),url:q.url(),status:q.status(),range:q.headers()['content-range']??null}));
  try{await page.goto(server.origin+'/index.html',{waitUntil:'load',timeout:30000});r.loadCompleted=true;}catch(e){r.loadCompleted=false;r.error=e.message;}
  r.media=await page.locator('#media').evaluate(m=>({readyState:m.readyState,networkState:m.networkState,error:m.error?.code??null,duration:Number.isFinite(m.duration)?m.duration:null,documentReady:document.readyState}));
  r.journal=server.getRequestLog();r.result=r.loadCompleted&&r.media.readyState>=1?'PASS':'INCONCLUSIVE';
 }finally{await browser.close();await server.close();records.push(r);}
}
const mode=process.argv[2];
if(mode==='chromium'){await chromiumProbe([]);await chromiumProbe(['--run-all-compositor-stages-before-draw']);}
else if(mode==='webkit'){await webkitProbe(false);await webkitProbe(true);}
else throw Error('mode required');
const result={at:new Date().toISOString(),platform:process.platform,node:process.version,playwright:'1.62.0',root,serverSha256:sha(fs.readFileSync(path.join(root,'scripts/governance/f2-gov-08-static-server.mjs'))),records};
fs.writeFileSync(path.join(out,`causal-${mode}.json`),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(records.map(({engine,result,error,context,samples,media,options})=>({engine,result,error,context,sampleCount:samples?.length,media,options})),null,2));
