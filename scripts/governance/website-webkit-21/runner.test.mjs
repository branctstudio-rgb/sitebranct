import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {runOnce,inspectPackage,regularBytes,projectJson} from './runner.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const proofs=fs.mkdtempSync(path.join(process.env.WEBSITE13_PROOF_DIR||os.tmpdir(),'wrapper-'));

const source='563f3c13665347b2a8578110e519ebaf13f356e8';
const wrapper='a'.repeat(40); // explicit synthetic SHA, never a proposed/published commit
const digest=JSON.parse(fs.readFileSync(path.join(here,'source-package.json'))).packageDigest;
function fixture(){
 const context={event:'workflow_dispatch',repository:'branctstudio-rgb/sitebranct',ref:'refs/heads/main',workflowRef:'branctstudio-rgb/sitebranct/.github/workflows/website-webkit-diagnostic-21.yml@refs/heads/main',sha:wrapper,wrapperSha:wrapper,runId:'123',attempt:'1',actor:'synthetic-human',authorizationId:'WEBSITE-WEBKIT-21-20260910-01'};
 context.authorization=`AUTHORIZE ${context.authorizationId} ${wrapper} ${source} ${digest}`;
 const facts={sourceHead:source,sourceTree:'ad5f79ab358e7de04d3de52c45f697f7134dc573',sourceClean:true,fullHistory:true,wrapperHead:wrapper,wrapperClean:true,packageDigest:digest,sourceFilesValid:true,platform:'linux',arch:'x64',ubuntu:'24.04',cpu:4,availableMemory:8*1024**3,freeBytes:11*1024**3,docker:{OSType:'linux',Architecture:'x86_64',NCPU:4,MemTotal:16*1024**3,CgroupVersion:'2'},rootAbsent:true,containersAbsent:true};
 const history={total_count:1,workflow_runs:[{id:123,display_title:context.authorizationId,head_sha:wrapper,event:'workflow_dispatch',run_attempt:1}]};
 const effects=[];
 const io={inspect:()=>facts,history:async()=>history,reserve:()=>effects.push('reserve'),prepareInput:()=>effects.push('input'),stage:name=>{effects.push(name);return {status:0,signal:null,error:null};},stopOwned:()=>effects.push('stop-owned'),collect:r=>{effects.push('collect');io.report=structuredClone(r);}};
 return {context,facts,history,io,effects};
}
test('nominal performs prepare and measure exactly once and collects without claiming Linux acceptance',async()=>{
 const f=fixture(),r=await runOnce(f.context,f.io);
 assert.equal(r.code,'MEASUREMENT_EXIT_ZERO_NOT_ACCEPTANCE');assert.equal(r.exitCode,0);
 assert.deepEqual(f.effects,['reserve','input','prepare','measure','stop-owned','collect']);
});
for(const [name,change,code] of [
 ['missing authorization',f=>f.context.authorization='', 'AUTHORIZATION_INVALID'],
 ['wrong wrapper SHA',f=>f.context.wrapperSha='b'.repeat(40),'AUTHORIZATION_INVALID'],
 ['wrong workflow/ref',f=>f.context.ref='refs/heads/topic','AUTHORIZATION_INVALID'],
 ['rerun attempt',f=>f.context.attempt='2','AUTHORIZATION_INVALID'],
 ['source drift',f=>f.facts.sourceHead='b'.repeat(40),'SOURCE_INVALID'],
 ['shallow ancestry',f=>f.facts.fullHistory=false,'SOURCE_INVALID'],
 ['source lock drift',f=>f.facts.sourceFilesValid=false,'SOURCE_INVALID'],
 ['package drift',f=>f.facts.packageDigest='b'.repeat(64),'PACKAGE_INVALID'],
 ['wrong host',f=>f.facts.platform='win32','HOST_INVALID'],
 ['low disk',f=>f.facts.freeBytes=10*1024**3-1,'RESOURCES_INSUFFICIENT'],
 ['low memory',f=>f.facts.availableMemory=1024**3,'RESOURCES_INSUFFICIENT'],
 ['low CPU',f=>f.facts.cpu=1,'RESOURCES_INSUFFICIENT'],
 ['Docker unavailable',f=>f.facts.docker=null,'DOCKER_INVALID'],
 ['incomplete local attempt',f=>f.facts.rootAbsent=false,'ATTEMPT_NOT_FRESH'],
 ['existing container',f=>f.facts.containersAbsent=false,'ATTEMPT_NOT_FRESH'],
 ['duplicate nominal ID',f=>{f.history.total_count=2;f.history.workflow_runs.push({...f.history.workflow_runs[0],id:122});},'HISTORY_INVALID'],
 ['incomplete API history',f=>f.history.total_count=2,'HISTORY_INVALID'],
 ['unknown current run',f=>f.history.workflow_runs[0].id=122,'HISTORY_INVALID'],
 ])test(`${name} stops before input/download/measurement effects`,async()=>{
 const f=fixture();change(f);const r=await runOnce(f.context,f.io);assert.equal(r.code,code);assert.equal(r.exitCode,1);assert.deepEqual(f.effects,['collect']);
});
for(const stage of ['prepare','measure'])for(const kind of ['nonzero','signal','error','unknown'])test(`${stage} ${kind} never retries or starts a later stage; evidence survives`,async()=>{
 const f=fixture();f.io.stage=name=>{f.effects.push(name);return name!==stage?{status:0,signal:null,error:null}:kind==='nonzero'?{status:1}:kind==='signal'?{status:0,signal:'SIGTERM'}:kind==='error'?{status:0,error:{code:'ETIMEDOUT'}}:{};};
 const r=await runOnce(f.context,f.io);assert.equal(r.code,`${stage.toUpperCase()}_FAILED`);assert.equal(r.exitCode,1);
 assert.deepEqual(f.effects,stage==='prepare'?['reserve','input','prepare','stop-owned','collect']:['reserve','input','prepare','measure','stop-owned','collect']);
 assert.equal(f.io.report.exitCode,1);
});
test('collection failure cannot promote failed campaign to success',async()=>{
 const f=fixture();f.io.collect=()=>{throw Error('synthetic collector failure');};const r=await runOnce(f.context,f.io);assert.equal(r.exitCode,1);assert.equal(r.code,'COLLECTION_FAILED');
});
test('cleanup failure remains rejected and still requests sanitized evidence',async()=>{
 const f=fixture();f.io.stopOwned=()=>{f.effects.push('stop-owned');throw Error('synthetic');};
 const r=await runOnce(f.context,f.io);assert.equal(r.code,'CLEANUP_FAILED');assert.equal(r.exitCode,1);assert.equal(f.effects.at(-1),'collect');
});
// Build the positive fixture from raw blobs in this distribution's immutable
// commit, not checkout-transformed bytes. The operational verifier stays strict.
function canonicalPackage(name){
 const cwd=process.env.WEBSITE21_CANONICAL_REPO||path.resolve(here,'../../..');
 const commit=execFileSync('git',['rev-parse','--verify','HEAD^{commit}'],{cwd,encoding:'utf8'}).trim();
 assert.match(commit,/^[0-9a-f]{40}$/);
 const files=JSON.parse(fs.readFileSync(path.join(here,'source-package.json'),'utf8')).packageFiles;
 assert.equal(files.length,3);
 const d=path.join(proofs,name);fs.mkdirSync(d);
 for(const {file} of files){
  const bytes=execFileSync('git',['cat-file','blob',`${commit}:scripts/governance/website-webkit-21/package/${file}`],{cwd});
  fs.writeFileSync(path.join(d,file),bytes);
 }
 assert.equal(inspectPackage(d),digest);
 return d;
}
test('verified seven files reproduce package identity; altered bytes cannot be accepted',()=>{
 const d=canonicalPackage('altered-package');
 fs.appendFileSync(path.join(d,'linux-run.mjs'),'\n// synthetic altered byte\n');
 assert.throws(()=>inspectPackage(d),/PACKAGE_INVALID/);
});
for(const [name,change] of [
 ['actual CRLF bytes',text=>text.replace(/\n/g,'\r\n')],
 ['same-length space change',text=>text.replace(' ','\t')],
 ['removed final newline',text=>text.replace(/\n$/,'')],
 ['reordered lines',text=>{const lines=text.split('\n');[lines[0],lines[1]]=[lines[1],lines[0]];return lines.join('\n');}],
])test(`package ${name} remains rejected without input normalization`,()=>{
 const d=canonicalPackage(`tamper-${name.replaceAll(' ','-')}`),file=path.join(d,'linux-run.mjs');
 const before=fs.readFileSync(file),after=Buffer.from(change(before.toString('utf8')));
 assert.equal(before.includes(Buffer.from('\r\n')),false);
 assert.equal(after.equals(before),false,'tampering must really change distributed bytes');
 fs.writeFileSync(file,after);
 assert.throws(()=>inspectPackage(d),/PACKAGE_INVALID/);
});
test('missing package component and directory in place of file are rejected',()=>{
 const d=path.join(proofs,'missing');fs.mkdirSync(d);assert.throws(()=>inspectPackage(d));assert.throws(()=>regularBytes(d),/PACKAGE_INVALID/);
});
test('sanitized projection never publishes arbitrary content, messages, URLs or credentials',()=>{
 const secret='SYNTHETIC_CREDENTIAL_NEVER_UPLOAD';
 const projected=projectJson('responsive-chromium.json',JSON.stringify({message:secret,html:secret,execution:{complete:true,actions:[secret],semanticTests:[{status:secret},{status:'PASS'}],infrastructureErrors:[secret]},observations:[secret]}));
 assert.equal(JSON.stringify(projected).includes(secret),false);assert.equal(projected.actions,1);assert.equal(projected.infrastructureErrors,1);assert.deepEqual(projected.semanticStatuses,['UNKNOWN','PASS']);
 assert.throws(()=>projectJson('summary.json','{truncated'));
});
test('summary preserves nonzero/unknown status without emitting child error text',()=>{
 const p=projectJson('summary.json',JSON.stringify({head:source,results:[{name:'lexical',status:1,error:'SECRET',signal:null},{name:'evil',error:null}]}));
 assert.deepEqual(p.results,[{name:'lexical',status:1,errorPresent:true,signalPresent:false},{name:'UNRECOGNIZED',status:null,errorPresent:false,signalPresent:false}]);
});
for(const eol of ['LF','CRLF'])test(`${eol}: removing only stage stop lets forbidden measure start (load-bearing mutation)`,async()=>{
 const original=fs.readFileSync(path.join(here,'runner.mjs'));
 const guard='requireThat(success(p),`${stage.toUpperCase()}_FAILED`);';
 const sourceText=original.toString().replace(/\r?\n/g,eol==='LF'?'\n':'\r\n');
 assert.equal(sourceText.split(guard).length,2);
 const mutant=sourceText.replace(guard,'void 0;');assert.notEqual(mutant,sourceText);
 const d=path.join(proofs,`mutant-${eol}`);fs.mkdirSync(d);fs.copyFileSync(path.join(here,'source-package.json'),path.join(d,'source-package.json'));fs.writeFileSync(path.join(d,'runner.mjs'),mutant);
 const module=await import(pathToFileURL(path.join(d,'runner.mjs')));
 const f=fixture();f.io.stage=name=>{f.effects.push(name);return {status:name==='prepare'?1:0};};
 await module.runOnce(f.context,f.io);
 assert.ok(f.effects.includes('measure'),'removed guard must reintroduce forbidden stage');
 assert.throws(()=>assert.deepEqual(f.effects,['reserve','input','prepare','stop-owned','collect']));
 assert.ok(fs.readFileSync(path.join(here,'runner.mjs')).equals(original));
 fs.writeFileSync(path.join(d,'observation.json'),JSON.stringify({eol,effects:f.effects,originalUnchanged:true},null,2));
});
// Synthetic data mirrors the unchanged package causal-browser.mjs writer.
// The test calls the real projection; it does not execute a browser or claim a Linux result.
function causalFixture(engine){
 const secret='SYNTHETIC_PRIVATE_TEXT';
 const records=engine==='chromium'?[[],['--run-all-compositor-stages-before-draw']].map((args,i)=>({engine,version:'149.0.7827.0',options:{headless:true,args},context:'newPage',deadline:2500,before:{left:340,focused:true,visibility:'visible',timeOrigin:123},samples:i?[{raf:100,perf:101,wall:123,timeline:100,rect:[20,220,0,300],active:false,animations:[],focus:true,hostElapsed:547.5}]:[],events:[],result:i?'PASS':'INCONCLUSIVE',...(i?{}:{error:secret})})):
 ['newPage','newContext.newPage'].map((context,i)=>({engine,version:'26.0',options:{headless:true},context,deadline:30000,mediaSha256:'b'.repeat(64),events:[],loadCompleted:!!i,media:{readyState:i?4:0,networkState:i?1:2,error:null,duration:i?4.2:null,documentReady:i?'complete':'interactive'},journal:[],result:i?'PASS':'INCONCLUSIVE',...(i?{}:{error:secret})}));
 return {at:'2026-09-11T00:00:00Z',platform:'synthetic',node:'v24.15.0',playwright:'1.62.0',root:secret,serverSha256:'c'.repeat(64),records};
}
function assertCausalUseful(projected){
 assert.equal(projected.recordCount,2);
 assert.ok(Array.isArray(projected.records),'A/B records must survive projection, not only their count');
 assert.deepEqual(projected.records.map(r=>r.result),['INCONCLUSIVE','PASS']);
 assert.deepEqual(projected.records.map(r=>r.variant),['STANDARD','COMPOSITOR']);
 assert.deepEqual(projected.records.map(r=>r.sampleCount),[0,1]);
 assert.deepEqual(projected.records.map(r=>r.lastHostElapsed),[null,547.5]);
}
test('causal Chromium retains A/B result, variant and measured timing instead of indistinguishable counts',()=>{
 const p=projectJson('causal-chromium.json',JSON.stringify(causalFixture('chromium')));assertCausalUseful(p);
 assert.equal(p.records[0].errorPresent,true);assert.equal(p.records[1].errorPresent,false);
 assert.deepEqual(p.records[1].lastRect,[20,220,0,300]);assert.equal(p.records[1].lastFocus,true);assert.equal(p.records[1].lastAnimationActive,false);
});
test('causal WebKit retains load failure versus completion and media readiness for both contexts',()=>{
 const p=projectJson('causal-webkit.json',JSON.stringify(causalFixture('webkit')));
 assert.ok(Array.isArray(p.records),'WebKit context/results must survive projection');
 assert.deepEqual(p.records.map(r=>r.context),['newPage','newContext.newPage']);
 assert.deepEqual(p.records.map(r=>r.result),['INCONCLUSIVE','PASS']);
 assert.deepEqual(p.records.map(r=>r.loadCompleted),[false,true]);
 assert.deepEqual(p.records.map(r=>r.media),[{readyState:0,networkState:2,error:null,duration:null,documentReady:'interactive'},{readyState:4,networkState:1,error:null,duration:4.2,documentReady:'complete'}]);
});
test('causal projection excludes arbitrary top-level, event, journal, error and sample text',()=>{
 for(const engine of ['chromium','webkit']){
  const f=causalFixture(engine),secret='SYNTHETIC_PRIVATE_TEXT';
  for(const r of f.records){r.extra=secret;r.events=[{kind:'request',url:secret,failure:secret}];r.journal=[{url:secret}];if(r.samples?.length)r.samples[0].extra=secret;}
  const p=projectJson(`causal-${engine}.json`,JSON.stringify(f));
  assert.ok(Array.isArray(p.records),'sane artifact still needs its measured records');
  assert.equal(p.records.length,2);assert.equal(JSON.stringify(p).includes(secret),false);
 }
});
for(const [name,mutate] of [
 ['missing records',f=>delete f.records],['partial comparison',f=>f.records.pop()],
 ['duplicate variant',f=>f.records[1]=structuredClone(f.records[0])],
 ['unrecognized result',f=>f.records[0].result='private text'],
 ['arbitrary version',f=>f.records[0].version='https://private.invalid'],
 ['wrong engine',f=>f.records[0].engine='firefox'],
 ['unknown argument',f=>f.records[0].options.args=['private text']],
 ['non-numeric timing',f=>f.records[1].samples[0].hostElapsed='private text'],
 ['missing sample array',f=>delete f.records[0].samples],
 ])test(`causal ${name} cannot silently produce a usable A/B artifact`,()=>{
 const f=causalFixture('chromium');mutate(f);assert.throws(()=>projectJson('causal-chromium.json',JSON.stringify(f)),/COLLECTION_FAILED/);
});
test('causal media metrics cannot leak text or treat unknown readiness as measured',()=>{
 for(const field of ['readyState','networkState','error','duration','documentReady']){
  const f=causalFixture('webkit');f.records[0].media[field]='SYNTHETIC_PRIVATE_TEXT';
  assert.throws(()=>projectJson('causal-webkit.json',JSON.stringify(f)),/COLLECTION_FAILED/);
 }
});
for(const eol of ['LF','CRLF'])test(`causal ${eol}: removing projection makes the A/B diagnostic assertion fail (load-bearing mutation)`,async()=>{
 const original=fs.readFileSync(path.join(here,'runner.mjs'));
 const text=original.toString().replace(/\r?\n/g,eol==='LF'?'\n':'\r\n');
 const guard="if(name==='causal-chromium.json'||name==='causal-webkit.json')return projectCausal(name,obj);";
 assert.equal(text.split(guard).length,2);
 const mutant=text.replace(guard,'void 0;');assert.notEqual(mutant,text);
 const d=path.join(proofs,`causal-mutant-${eol}`);fs.mkdirSync(d);
 fs.copyFileSync(path.join(here,'source-package.json'),path.join(d,'source-package.json'));fs.writeFileSync(path.join(d,'runner.mjs'),mutant);
 const module=await import(pathToFileURL(path.join(d,'runner.mjs')));
 const data=JSON.stringify(causalFixture('chromium'));
 assertCausalUseful(projectJson('causal-chromium.json',data));
 const damaged=module.projectJson('causal-chromium.json',data);
 assert.equal(damaged.recordCount,2);assert.equal(damaged.records,undefined);
 assert.throws(()=>assertCausalUseful(damaged),/A\/B records must survive projection/);
 assert.ok(fs.readFileSync(path.join(here,'runner.mjs')).equals(original));
 fs.writeFileSync(path.join(d,'observation.json'),JSON.stringify({eol,mutation:'causal projection removed',assertionFails:true,damaged,originalUnchanged:true},null,2));
});

test.after(()=>console.log(`Local fake-boundary proof files: ${proofs}; no Linux/Docker/browser/network executed`));
