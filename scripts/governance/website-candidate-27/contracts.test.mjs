import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../../..');
const admission=await import('./admission.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const runtime=await import('./runtime.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const executor=await import('./executor.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const c=JSON.parse(fs.readFileSync(path.join(here,'contract.json')));
const git=(...args)=>execFileSync('git',['-C',repo,...args]);

test('exact seven-file candidate is admitted for measurement only, not merge or READY',()=>{
  assert.equal(typeof admission.verifyCandidate,'function');
  const r=admission.verifyCandidate(repo,{base:c.base,head:c.candidate});
  assert.equal(r.status,'MEASUREMENT_SOURCE_ADMITTED');assert.equal(r.count,7);
  assert.equal(r.productionAuthorized,false);assert.equal(r.ready,false);
});
test('authority missing, alias, old candidate, wrong base and unresolved Git objects reject',()=>{
  assert.equal(typeof admission.verifyCandidate,'function');
  for(const head of [undefined,'HEAD',c.testSource,'f'.repeat(40)]) assert.throws(()=>admission.verifyCandidate(repo,{base:c.base,head}));
  assert.throws(()=>admission.verifyCandidate(repo,{base:c.technicalParent,head:c.candidate}));
});
test('a genuine extra-path Git tree, even a sibling technical file, is not this candidate',()=>{
  assert.equal(typeof admission.verifyCandidate,'function');
  assert.throws(()=>admission.verifyCandidate(repo,{base:c.base,head:c.technicalParent}),/candidate/);
  const entries=c.candidateChanges;
  for(const file of ['index.html','.github/workflows/deploy.yml','package-lock.json','fixtures/audit/f2-01-ci-runtime.json','docs/website-base/extra.md']) {
    assert.throws(()=>admission.validateChanges([...entries,{...entries[0],file}]),/closed|paths/);
  }
  for(const mutate of [x=>x.pop(),x=>x.reverse(),x=>x[0].mode='120000',x=>x[0].blob='0'.repeat(40),x=>x[0].file='CRM-gestao.html']) {
    const value=structuredClone(entries);mutate(value);assert.throws(()=>admission.validateChanges(value));
  }
});
test('runtime inspection requires the real installed package and exact builds; no fabricated registry',()=>{
  assert.equal(typeof runtime.inspectRuntime,'function');
  const provider=process.env.WEBSITE_EXISTING_RUNTIME;
  assert.ok(provider,'explicit existing runtime path required for local characterization');
  const r=runtime.inspectRuntime(repo,provider);
  assert.equal(r.version,'1.62.0');assert.deepEqual(r.builds.map(x=>x.revision),['1234','1538','2336']);
  assert.equal(r.installed,false);assert.equal(r.registrySha256.length,64);
  for(const p of [undefined,path.join(provider,'missing')])assert.throws(()=>runtime.inspectRuntime(repo,p));
  const fact=structuredClone(r);
  for(const change of [x=>x.version='1.62.1',x=>x.builds.pop(),x=>x.builds[1].revision='0',x=>x.lockVersion='latest',x=>x.coreVersion='1.61.0']) {
    const value=structuredClone(fact);change(value);assert.throws(()=>runtime.validateFacts(value));
  }
});
test('launcher refuses absent or wrong immutable authority before creating output or spawning',()=>{
  const script=path.join(here,'runtime.mjs');assert.ok(fs.existsSync(script));
  const output=path.join(os.tmpdir(),`website27-absent-${process.pid}`);
  for(const authority of ['HEAD','0'.repeat(40),'']) {
    const p=spawnSync(process.execPath,[script,'audit',repo,authority,'missing',output],{encoding:'utf8'});
    assert.notEqual(p.status,0);assert.match(p.stderr,/AUTHORITY/);assert.equal(fs.existsSync(output),false);
  }
});

// Deliberately synthetic unit inputs, NOT a measured GREEN baseline or receipt.
function synthetic(engine){
  const matrix=JSON.parse(git('show',`${c.base}:fixtures/audit/f2-01-menu-evidence-matrix.json`));
  const transition=JSON.parse(git('show',`${c.base}:fixtures/audit/f2-01-transition.json`));
  const version={chromium:'151.0.7922.34',firefox:'153.0',webkit:'26.5'}[engine];
  return {schemaVersion:2,source:'a47abb9a43248320dfef8449b6a65e187913fd24',browser:{engine,version},viewports:transition.f201.matrix.viewports,
    observations:transition.f201.matrix.routes.flatMap(route=>Object.keys(transition.f201.matrix.viewports).map(viewport=>({route,viewport,conclusion:'CONCLUSIVE',overflow:false,clientWidth:Number(viewport.split('x')[0]),scrollWidth:Number(viewport.split('x')[0]),header:null,smallTargets:[]}))),
    menuResults:matrix.entries.map(e=>({evidenceId:e.evidenceId,route:e.route,viewport:e.viewport,focusReached:true,focusStyle:{visible:true,style:'solid',width:2},open:{expanded:'true',drawerInside:true,focusInside:true,bodyLocked:true,backgroundInert:true,closeTarget:{x:44,y:44,name:'synthetic'}},closed:{expanded:'false',focusReturned:true,backgroundRestored:true,closed:true},closeButtonClosed:true,outsideClosed:true})),
    reducedMotion:{matches:true,durationsMs:[0]},execution:{complete:true,infrastructureErrors:[],actions:matrix.entries.flatMap(e=>e.actionPhases.map(phase=>({evidenceId:e.evidenceId,route:e.route,viewport:e.viewport,phase,status:'COMPLETED'}))),semanticTests:Object.keys(transition.f201.expectedDevelopmentRed.semanticVector).map(name=>({name,status:'PASS'}))}};
}
test('canonical full three-engine shape accepted only as technical evidence, never approval',()=>{
  assert.equal(typeof executor.validateReports,'function');
  const r=executor.validateReports(repo,c.engines.map(synthetic));
  assert.equal(r.status,'TECHNICAL_MEASUREMENT_COMPLETE_NOT_READY');assert.equal(r.approval,false);assert.equal(r.baselineCreated,false);
});
test('missing engines, pins, 84/41/184 tuples, semantics and incomplete results are rejected',()=>{
  assert.equal(typeof executor.validateReports,'function');
  const reports=c.engines.map(synthetic);
  for(const mutate of [
    a=>a.pop(),a=>a.reverse(),a=>a[0].browser.version='0',a=>a[0].observations.pop(),a=>a[0].observations[0]=a[0].observations[1],
    a=>a[0].menuResults.pop(),a=>a[0].menuResults[0].evidenceId='forged',a=>a[0].menuResults[0].open.drawerInside=false,
    a=>a[0].execution.actions.pop(),a=>a[0].execution.actions[1]=a[0].execution.actions[0],a=>a[0].execution.complete=false,
    a=>a[0].execution.infrastructureErrors.push('timeout'),a=>a[0].execution.semanticTests[0].status='FAIL',
    a=>a[0].observations[0].overflow=true,a=>a[0].observations[0].scrollWidth+=1,a=>a[0].observations[0].smallTargets.push({width:1}),
    a=>delete a[0].reducedMotion,a=>a[0].reducedMotion.durationsMs=[2],a=>a[0].source=c.candidate
  ]) {const changed=structuredClone(reports);mutate(changed);assert.throws(()=>executor.validateReports(repo,changed));}
});
test('execution plan refuses arbitrary candidate, engine subset, image, timeout or mutable authority',()=>{
  assert.equal(typeof executor.plan,'function');
  const input={candidate:c.candidate,engines:c.engines,image:c.image,limits:c.limits};
  const plan=executor.plan(repo,input);assert.equal(plan.tasks.length,3);assert.equal(plan.network,'none');assert.equal(plan.testBlob,'8cc07c7f4c0937677f4f2357d6b8c687e87a41ec');
  for(const mutate of [x=>x.candidate=c.testSource,x=>x.engines=['webkit'],x=>x.image='latest',x=>x.limits.childTimeoutMs+=1,x=>x.authorization=true]){const v=structuredClone(input);mutate(v);assert.throws(()=>executor.plan(repo,v));}
});
test('materialization uses verified payload26 and exact trusted test563, with no candidate tests',()=>{
  assert.equal(typeof executor.materialize,'function');
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'website27-materialize-')),dest=path.join(parent,'source');
  const receipt=executor.materialize(repo,dest);assert.equal(receipt.candidate,c.candidate);assert.equal(receipt.testSource,c.testSource);
  assert.deepEqual(fs.readFileSync(path.join(dest,'tests/audit/f2-01-responsive.test.mjs')),git('cat-file','blob','8cc07c7f4c0937677f4f2357d6b8c687e87a41ec'));
  assert.equal(fs.existsSync(path.join(dest,'tests/website-base-config.test.mjs')),false);
  for(const e of c.payload)assert.equal(admission.hash(fs.readFileSync(path.join(dest,e.file))),e.sha256);
  assert.throws(()=>executor.materialize(repo,dest),/FRESH/);
});
test('load-bearing controls catch relaxed paths, completion, semantic vector and runtime pins in LF/CRLF',async()=>{
  const mutations=[
    ['admission.mjs',"assert.deepEqual(entries,pinned.candidateChanges,'closed candidate paths, modes and blobs differ');",'',async m=>assert.throws(()=>m.validateChanges([]))],
    ['runtime.mjs',"assert.equal(r.version,'1.62.0','RUNTIME_VERSION');",'',async m=>{const f=runtime.inspectRuntime(repo,process.env.WEBSITE_EXISTING_RUNTIME);f.version='1.62.1';f.coreVersion=f.version;f.lockVersion=f.version;assert.throws(()=>m.validateFacts(f));}],
    ['executor.mjs',"assert.equal(r.execution?.complete,true,'EXECUTION_INCOMPLETE');",'',async m=>{const r=c.engines.map(synthetic);r[0].execution.complete=false;assert.throws(()=>m.validateReports(repo,r));}],
    ['executor.mjs',"assert.deepEqual(r.execution.semanticTests,semanticNames.map(name=>({name,status:'PASS'})),'SEMANTIC_VECTOR');",'',async m=>{const r=c.engines.map(synthetic);r[0].execution.semanticTests[0].status='FAIL';assert.throws(()=>m.validateReports(repo,r));}],
  ];
  for(const eol of ['\n','\r\n'])for(const [file,needle,replacement,check]of mutations){
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'website27-mutation-'));
    for(const f of ['contract.json','admission.mjs','runtime.mjs','executor.mjs']){let bytes=fs.readFileSync(path.join(here,f),'utf8').replace(/\r?\n/g,eol);if(f===file){assert.equal(bytes.split(needle).length,2,'mutation must be unique and present');const changed=bytes.replace(needle,replacement);assert.notEqual(changed,bytes);bytes=changed;}fs.writeFileSync(path.join(dir,f),bytes);}
    const m=await import(pathToFileURL(path.join(dir,file)));await assert.rejects(()=>check(m),/Missing expected exception/);
  }
});
