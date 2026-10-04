// Controlled subprocesses test orchestration; they are NOT browser evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {generate} from '../fixtures/website-base/generate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'fixtures/website-base/verify.mjs');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'website34-'));
async function api() {
  assert.ok(fs.existsSync(entry), 'single executable verification entry is absent');
  return import(pathToFileURL(entry));
}
const stub = String.raw`
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const a=JSON.parse(process.argv[1]);
fs.mkdirSync(a.reportDir);fs.mkdirSync(path.join(a.reportDir,'screenshots'));
const cases=[];
for(const id of ['cedro','linha'])for(const [width,height]of [[320,568],[360,800],[390,844],[768,1024],[1024,768],[1440,900]])for(const route of ['index.html','contacto.html'])cases.push({engine:a.engine,id,route,width,height,status:'PASS'});
const screenshots=[];
for(const id of ['cedro','linha'])for(const name of ['390-menu','390-index','768-index','1440-index','390-contacto','1440-contacto']){
 const file='screenshots/'+a.engine+'-'+id+'-'+name+'.png',b=Buffer.from('CONTROLLED TEST DOUBLE; NOT AN IMAGE');
 fs.writeFileSync(path.join(a.reportDir,file),b);screenshots.push({file,head:a.head,sha256:crypto.createHash('sha256').update(b).digest('hex'),bytes:b.length});
}
const r={head:a.head,runId:a.runId,referenceManifests:a.referenceManifests,playwright:'1.62.0',startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),state:'PASS',engines:[{engine:a.engine,status:'EXECUTED',version:{chromium:'151.0.7922.34',firefox:'153.0',webkit:'26.5'}[a.engine]}],cases,screenshots,errors:[],externalAttempts:[],toolingDiagnostics:[],served:[{path:'/cedro/index.html',status:200}],cleanup:[{engine:a.engine,browserClosed:true},{serverListening:false}]};
if(a.mode==='missing-case')r.cases.pop();
if(a.mode==='duplicate-case')r.cases[23]=r.cases[0];
if(a.mode==='failed-case')r.cases[0].status='FAIL';
if(a.mode==='wrong-engine')r.engines[0].engine='opera';
if(a.mode==='unavailable')r.engines[0].status='NOT_VERIFIED';
if(a.mode==='old-report')r.runId='earlier-invocation';
if(a.mode==='wrong-reference')r.referenceManifests.cedro='0'.repeat(64);
if(a.mode==='version')r.playwright='0.0.0';
if(a.mode==='cleanup')r.cleanup=[];
if(a.mode==='external')r.externalAttempts=[{url:'https://not-used.invalid/'}];
if(a.mode==='screenshot')fs.appendFileSync(path.join(a.reportDir,screenshots[0].file),'changed');
if(a.mode!=='missing-report')fs.writeFileSync(path.join(a.reportDir,'QA.json'),a.mode==='truncated'?'{':JSON.stringify(r));
console.log('controlled '+a.mode);console.error('retained diagnostic '+a.mode);
process.exitCode=a.mode==='exit-failure'?7:0;
`;
function controlled(mode='complete') {
  return async args => {
    const result=spawnSync(process.execPath, ['-e', stub, JSON.stringify({...args,mode})], {encoding:'utf8'});
    return {code:result.status, signal:result.signal, stdout:result.stdout, stderr:result.stderr};
  };
}

test('one entry generates both identities, validates 72 simulated cases and never calls them browser runs', async()=>{
  const {verify}=await api(),out=path.join(temp(),'delivery');
  const r=await verify({out,launch:controlled()});
  assert.equal(r.state,'SIMULATION_PASS');assert.equal(r.browserCasesPassed,0);
  assert.equal(r.simulatedCasesValidated,72);assert.equal(r.runs.length,3);
  assert.deepEqual(r.runs.map(x=>x.engine),['chromium','firefox','webkit']);
  assert.equal(r.static.files,24);assert.equal(r.static.links,'PASS');
  assert.ok(fs.existsSync(path.join(out,'references/cedro/index.html')));
  assert.ok(fs.existsSync(path.join(out,'references/linha/contacto.html')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(out,'verification.json'))).runId,r.runId);
});
for(const mode of ['missing-case','duplicate-case','failed-case','wrong-engine','unavailable','old-report','wrong-reference','version','cleanup','external','screenshot','missing-report','truncated','exit-failure']) {
  test(`orchestrator rejects ${mode}, retains failure logs and still collects all engines`,async()=>{
    const {verify}=await api(),out=path.join(temp(),'delivery');
    const r=await verify({out,launch:controlled(mode)});
    assert.equal(r.state,'FAIL');assert.equal(r.runs.length,3);
    assert.equal(r.runs.every(x=>x.state==='FAIL'),true);
    assert.match(fs.readFileSync(path.join(out,'chromium.stderr.log'),'utf8'),/retained diagnostic/);
    assert.ok(r.runs.every(x=>x.error));
  });
}
test('omitting an engine cannot produce complete acceptance',async()=>{
  const {verify}=await api();
  const r=await verify({out:path.join(temp(),'delivery'),engines:['chromium','webkit'],launch:controlled()});
  assert.equal(r.state,'PARTIAL');assert.deepEqual(r.missingEngines,['firefox']);
});
test('duplicate/unknown engine or existing output is rejected before touching owned data',async()=>{
  const {verify}=await api(),p=temp();fs.writeFileSync(path.join(p,'keep.txt'),'owned');
  await assert.rejects(verify({out:p,launch:controlled()}),/exist/);
  for(const engines of [['firefox','firefox'],['opera'],[]]) await assert.rejects(verify({out:path.join(p,'new'),engines,launch:controlled()}),/engine/);
  assert.deepEqual(fs.readdirSync(p),['keep.txt']);
});
test('CLI rejects missing arguments without launching browsers',async()=>{
  await api();const r=spawnSync(process.execPath,[entry],{encoding:'utf8'});
  assert.notEqual(r.status,0);assert.match(r.stderr,/Usage:/);
});
function sites(){
  const dir=temp();for(const id of ['cedro','linha'])generate(JSON.parse(fs.readFileSync(path.join(root,`fixtures/website-base/${id}.json`))),path.join(dir,id));return dir;
}
test('resource verification rejects corrupt files and cross-brand configuration without modifying either site',async()=>{
  const {verifySites}=await api(),dir=sites();
  fs.copyFileSync(path.join(dir,'linha/manifest.json'),path.join(dir,'cedro/manifest.json'));
  assert.throws(()=>verifySites(dir),/config|identity/);
  const other=sites();fs.appendFileSync(path.join(other,'cedro/assets/navigation.js'),'changed');
  assert.throws(()=>verifySites(other),/hash|digest|bytes/);
});
test('brand A variation leaves B intact and verification detects A no longer matching its canonical configuration',async()=>{
  const {verifySites}=await api(),dir=sites(),before=fs.readFileSync(path.join(dir,'linha/manifest.json'));
  const c=JSON.parse(fs.readFileSync(path.join(root,'fixtures/website-base/cedro.json')));c.name='Ateliê Variação';
  const variant=temp();generate(c,path.join(variant,'cedro'));
  for(const f of ['index.html','contacto.html','manifest.json'])fs.copyFileSync(path.join(variant,'cedro',f),path.join(dir,'cedro',f));
  assert.throws(()=>verifySites(dir),/config|identity/);assert.deepEqual(fs.readFileSync(path.join(dir,'linha/manifest.json')),before);
});

for(const [label,from,to]of [
  ['canonical route','rel="canonical" href="https://cedro.example.invalid/"','rel="canonical" href="https://cedro.example.invalid/nonexistent.html"'],
  ['OG URL','property="og:url" content="https://cedro.example.invalid/"','property="og:url" content="https://linha.example.invalid/"'],
  ['OG title','property="og:title" content="Ateliê Cedro"','property="og:title" content="Estúdio Linha"'],
  ['OG description','property="og:description" content="Uma referência','property="og:description" content="Outra referência'],
  ['OG image','property="og:image" content="https://cedro.example.invalid/assets/social.webp"','property="og:image" content="https://linha.example.invalid/assets/social.webp"'],
  ['Twitter image','name="twitter:image" content="https://cedro.example.invalid/assets/social.webp"','name="twitter:image" content="https://linha.example.invalid/assets/social.webp"'],
  ['JSON-LD description','"description":"Uma referência','"description":"Outra referência'],
  ['JSON-LD logo','"logo":"https://cedro.example.invalid/assets/mark.svg"','"logo":"https://linha.example.invalid/assets/mark.svg"'],
  ['robots','content="noindex, nofollow"','content="index, follow"'],
  ['external resource','src="assets/navigation.js"','src="https://cedro.example.invalid/assets/navigation.js"']
])test(`metadata regression with internally consistent manifest is rejected: ${label}`,async()=>{
  const {verifySites}=await api(),dir=sites(),page=path.join(dir,'cedro/index.html');
  const before=fs.readFileSync(page,'utf8'),after=before.replace(from,to);assert.notEqual(after,before,'mutation must change bytes');
  fs.writeFileSync(page,after);
  const file=path.join(dir,'cedro/manifest.json'),m=JSON.parse(fs.readFileSync(file)),entry=m.files.find(f=>f.path==='index.html');
  const bytes=fs.readFileSync(page);entry.bytes=bytes.length;entry.sha256=createHash('sha256').update(bytes).digest('hex');fs.writeFileSync(file,JSON.stringify(m));
  assert.throws(()=>verifySites(dir),/canonical|metadata|identity|social|external/);
});
