// Trusted local developer tool, not a replacement for the base-only governance gate.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {generate, validate} from './generate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const enginesRequired = ['chromium', 'firefox', 'webkit'];
const ids = ['cedro', 'linha'];
const pages = ['index.html', 'contacto.html'];
const viewports = [[320,568],[360,800],[390,844],[768,1024],[1024,768],[1440,900]];
const paths = ['index.html','contacto.html','assets/site.css','assets/project.css','assets/navigation.js','assets/mark.svg','assets/social.webp','assets/manrope.woff2','assets/bricolage.woff2','robots.txt','sitemap.xml'].sort();
const hash = b => createHash('sha256').update(b).digest('hex');
const json = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const config = id => validate(json(path.join(root, `fixtures/website-base/${id}.json`)));
const escape = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const runtime = json(path.join(root, 'fixtures/audit/f2-01-ci-runtime.json'));
const sourcePaths = ['fixtures/website-base/generate.mjs','fixtures/website-base/verify.mjs','tests/website-base-browser.mjs','fixtures/website-base/site.css','fixtures/website-base/navigation.js','fixtures/website-base/provenance.json','fixtures/website-base/cedro.json','fixtures/website-base/linha.json','package.json','package-lock.json','fixtures/audit/f2-01-ci-runtime.json'];
const sources = () => Object.fromEntries(sourcePaths.map(p => [p, hash(fs.readFileSync(path.join(root,p)))]));
const write = (p,data) => fs.writeFileSync(p, typeof data==='string' ? data : JSON.stringify(data,null,2)+'\n', {flag:'wx'});

function regularFiles(dir, prefix='') {
  return fs.readdirSync(dir).flatMap(name=>{
    const relative=prefix+name, p=path.join(dir,name), stat=fs.lstatSync(p);
    assert.ok(!stat.isSymbolicLink(), 'linked generated resource');
    if(stat.isDirectory()) return regularFiles(p,relative+'/');
    assert.ok(stat.isFile(), 'non-regular generated resource');
    return [relative];
  }).sort();
}

export function verifySites(sites) {
  const manifests={},htmls={};
  for(const id of ids) {
    const dir=path.join(sites,id), c=config(id), m=json(path.join(dir,'manifest.json'));
    assert.equal(c.id,id,'canonical configuration identity');
    assert.equal(m.configSha256,hash(JSON.stringify(c)),'configuration identity mismatch');
    assert.equal(m.synthetic,true);assert.equal(m.schema,1);
    assert.deepEqual(regularFiles(dir),[...paths,'manifest.json'].sort(),'generated paths incomplete or extra');
    assert.deepEqual(m.files.map(f=>f.path).sort(),paths,'manifest paths incomplete or duplicate');
    for(const f of m.files) {
      const b=fs.readFileSync(path.join(dir,f.path));
      assert.equal(b.length,f.bytes,'resource bytes mismatch');assert.equal(hash(b),f.sha256,'resource digest mismatch');
    }
    const docs=Object.fromEntries(pages.map(p=>[p,fs.readFileSync(path.join(dir,p),'utf8')]));
    for(const [name,html]of Object.entries(docs)) {
      const schemas=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      assert.equal(schemas.length,1,'metadata JSON-LD cardinality');
      assert.deepEqual(JSON.parse(schemas[0][1]),{'@context':'https://schema.org','@type':'Organization',name:c.name,description:c.description,url:c.origin+'/',logo:c.origin+'/assets/mark.svg'},'metadata JSON-LD identity mismatch');
      const contact=name==='contacto.html',url=c.origin+(contact?'/contacto.html':'/');
      assert.deepEqual([...html.matchAll(/<title>([^<]*)<\/title>/g)].map(m=>m[1]),[escape(c.name)+(contact?' — Contacto demonstrativo':'')+' | Referência sintética'],'metadata title mismatch');
      const tags=[...html.matchAll(/<(?:meta|link)\b[^>]*>/g)].map(m=>m[0]);
      const attribute=(tag,key)=>tag.match(new RegExp(`\\b${key}="([^"]*)"`))?.[1];
      const field=(selector,key,value,result,expected)=>{
        const matches=tags.filter(tag=>tag.startsWith('<'+selector+' ')&&attribute(tag,key)===value);
        assert.equal(matches.length,1,`metadata ${value} cardinality`);
        assert.equal(attribute(matches[0],result),escape(expected),`metadata ${value} mismatch`);
      };
      field('link','rel','canonical','href',url);
      for(const [property,value]of Object.entries({'og:type':'website','og:url':url,'og:title':c.name,'og:description':c.description,'og:image':c.origin+'/assets/social.webp'}))field('meta','property',property,'content',value);
      for(const [name,value]of Object.entries({description:contact?c.contactText:c.description,robots:'noindex, nofollow','twitter:card':'summary_large_image','twitter:image':c.origin+'/assets/social.webp'}))field('meta','name',name,'content',value);
      const resourceTags=[...html.matchAll(/<(?:a|link|script|img)\b[^>]*>/g)].map(m=>m[0]).filter(tag=>!(tag.startsWith('<link ')&&attribute(tag,'rel')==='canonical'));
      for(const match of resourceTags.join('\n').matchAll(/\b(href|src)="([^"]+)"/g)) {
        const value=match[2];
        assert.ok(!/^(?:[a-z]+:|\/\/)/i.test(value),'external generated resource/link');
        const u=new URL(value,`http://local.invalid/${id}/${name}`);
        assert.equal(u.origin,'http://local.invalid');assert.ok(u.pathname.startsWith(`/${id}/`),'cross-brand link');
        const target=u.pathname.slice(id.length+2);assert.ok(paths.includes(target),'missing link/resource');
        if(u.hash) assert.ok(docs[target]?.includes(`id="${u.hash.slice(1)}"`),'missing local anchor');
      }
    }
    for(const p of ['assets/site.css','assets/project.css']) {
      const css=fs.readFileSync(path.join(dir,p),'utf8');
      for(const match of css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) {
        const u=new URL(match[1],`http://local.invalid/${id}/${p}`);
        assert.equal(u.origin,'http://local.invalid','external CSS resource');
        assert.ok(u.pathname.startsWith(`/${id}/`)&&paths.includes(u.pathname.slice(id.length+2)),'missing CSS resource');
      }
    }
    htmls[id]=docs['index.html'];manifests[id]=hash(fs.readFileSync(path.join(dir,'manifest.json')));
  }
  assert.notEqual(htmls.cedro,htmls.linha,'identities collapsed');
  return {files:24,resources:22,links:'PASS',identities:'PASS',referenceManifests:manifests};
}

function acceptReport(report,args) {
  assert.equal(report.head,args.head,'report head mismatch');assert.equal(report.runId,args.runId,'report from another invocation');
  assert.deepEqual(report.referenceManifests,args.referenceManifests,'report reference mismatch');
  assert.equal(report.playwright,runtime.playwright.version,'Playwright version mismatch');
  assert.equal(report.state,'PASS','harness not PASS');
  assert.equal(report.engines?.length,1,'exactly one engine report required');
  assert.equal(report.engines[0].engine,args.engine,'wrong engine');
  assert.equal(report.engines[0].status,'EXECUTED','engine not executed');
  assert.equal(report.engines[0].version,runtime.playwright.browserBuilds[args.engine].version,'browser version mismatch');
  const start=Date.parse(report.startedAt),end=Date.parse(report.finishedAt);
  assert.ok(Number.isFinite(start)&&start>=args.startedMs&&end>=start&&end<=Date.now(),'invalid report timestamps');
  assert.deepEqual(report.errors,[],'harness errors');assert.deepEqual(report.externalAttempts,[],'external attempts');
  assert.ok(Array.isArray(report.served)&&report.served.length>0&&report.served.every(x=>x.status===200),'resource requests failed or absent');
  assert.deepEqual(report.cleanup,[{engine:args.engine,browserClosed:true},{serverListening:false}],'owned resources not closed');
  const key=c=>JSON.stringify([c.engine,c.id,c.route,c.width,c.height]);
  const expected=ids.flatMap(id=>viewports.flatMap(([width,height])=>pages.map(route=>key({engine:args.engine,id,route,width,height})))).sort();
  assert.deepEqual(report.cases.map(key).sort(),expected,'case matrix incomplete, duplicate or unknown');
  assert.ok(report.cases.every(c=>c.status==='PASS'),'case failure');
  const captureNames=ids.flatMap(id=>['390-menu','390-index','768-index','1440-index','390-contacto','1440-contacto'].map(s=>`screenshots/${args.engine}-${id}-${s}.png`)).sort();
  assert.deepEqual(report.screenshots.map(s=>s.file).sort(),captureNames,'screenshot set incomplete or duplicate');
  for(const s of report.screenshots) {
    assert.equal(s.head,args.head);const p=path.join(args.reportDir,s.file);assert.ok(fs.lstatSync(p).isFile()&&!fs.lstatSync(p).isSymbolicLink());
    const b=fs.readFileSync(p);assert.equal(b.length,s.bytes);assert.equal(hash(b),s.sha256,'screenshot digest mismatch');
  }
  return expected.length;
}

function runHarness(args) {
  return new Promise(resolve=>{
    const child=spawn(process.execPath,[path.join(root,'tests/website-base-browser.mjs'),args.sites,args.reportDir],{
      cwd:root,windowsHide:true,env:{...process.env,WEBSITE_ENGINES:args.engine,WEBSITE_RUN_ID:args.runId},stdio:['ignore','pipe','pipe']
    });
    let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
    child.once('error',e=>{stderr+=e.stack;});
    child.once('close',(code,signal)=>resolve({code,signal,stdout,stderr}));
  });
}

export async function verify({out,engines=enginesRequired,launch=runHarness}) {
  assert.ok(Array.isArray(engines)&&engines.length&&new Set(engines).size===engines.length&&engines.every(e=>enginesRequired.includes(e)),'unknown, empty or duplicate engines');
  assert.ok(typeof out==='string'&&path.isAbsolute(out),'absolute new output required');
  out=path.resolve(out);assert.ok(!fs.existsSync(out),'output already exists');
  for(let p=path.dirname(out);;p=path.dirname(p)) {
    assert.ok(fs.lstatSync(p).isDirectory()&&!fs.lstatSync(p).isSymbolicLink(),'linked output ancestor');
    if(p===path.dirname(p))break;
  }
  const lock=json(path.join(root,'package-lock.json')),pkg=json(path.join(root,'package.json'));
  assert.equal(pkg.devDependencies.playwright,runtime.playwright.version);
  assert.equal(lock.packages['node_modules/playwright'].version,runtime.playwright.version,'lockfile Playwright mismatch');
  const report={runId:randomUUID(),head:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),startedAt:new Date().toISOString(),sourceDigests:sources(),mode:launch===runHarness?'BROWSER_EXECUTION':'CONTROLLED_SIMULATION',state:'RUNNING',runs:[],missingEngines:enginesRequired.filter(e=>!engines.includes(e)),browserCasesPassed:0,simulatedCasesValidated:0};
  fs.mkdirSync(out);const sites=path.join(out,'references');fs.mkdirSync(sites);
  try {
    for(const id of ids)generate(config(id),path.join(sites,id));
    report.static=verifySites(sites);
    for(const engine of engines) {
      const args={engine,head:report.head,runId:report.runId,sites,reportDir:path.join(out,engine),referenceManifests:report.static.referenceManifests,startedMs:Date.now()};
      const item={engine,state:'RUNNING',casesValidated:0};report.runs.push(item);
      try {
        const result=await launch(args);
        write(path.join(out,engine+'.stdout.log'),result.stdout||'');write(path.join(out,engine+'.stderr.log'),result.stderr||'');
        item.exitCode=result.code;item.signal=result.signal||null;
        assert.equal(result.code,0,'harness subprocess failed');assert.equal(item.signal,null,'harness interrupted');
        item.casesValidated=acceptReport(json(path.join(args.reportDir,'QA.json')),args);
        item.reportSha256=hash(fs.readFileSync(path.join(args.reportDir,'QA.json')));item.state='PASS';
      } catch(e) {item.state='FAIL';item.error=e.stack;}
    }
    assert.deepEqual(verifySites(sites),report.static,'generated resources changed during QA');
    assert.deepEqual(sources(),report.sourceDigests,'verification sources changed during QA');
    const count=report.runs.reduce((n,r)=>n+r.casesValidated,0);
    report[report.mode==='BROWSER_EXECUTION'?'browserCasesPassed':'simulatedCasesValidated']=count;
    report.state=report.runs.some(r=>r.state!=='PASS')?'FAIL':report.missingEngines.length?'PARTIAL':report.mode==='CONTROLLED_SIMULATION'?'SIMULATION_PASS':'PASS';
  } catch(e) {report.state='FAIL';report.error=e.stack;}
  report.finishedAt=new Date().toISOString();write(path.join(out,'verification.json'),report);return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [out,selection,...extra]=process.argv.slice(2);
    assert.ok(out&&!extra.length&&(!selection||selection.startsWith('--engines=')),'Usage: node fixtures/website-base/verify.mjs ABSOLUTE_NEW_OUTPUT [--engines=chromium,firefox,webkit]');
    const report=await verify({out,...(selection?{engines:selection.slice(10).split(',')}:{})});
    console.log(JSON.stringify({state:report.state,head:report.head,report:path.join(out,'verification.json'),runs:report.runs}));
    process.exitCode=report.state==='PASS'?0:1;
  } catch(e) {console.error(e.message);process.exitCode=1;}
}
