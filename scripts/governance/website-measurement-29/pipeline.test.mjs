import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createTrace} from './diagnostics.mjs';
import {execFileSync} from 'node:child_process';
import {contract} from '../website-candidate-27/admission.mjs';
import {validateReports} from '../website-candidate-27/executor.mjs';
import {instrument} from './instrument.mjs';
import vm from 'node:vm';
const m=await import('./runner.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const good={repository:'branctstudio-rgb/sitebranct',event:'push',ref:'refs/heads/agent/website-diagnostic-measurement-29',sha:'b'.repeat(40),attempt:'1',runId:'123',workflowRef:'branctstudio-rgb/sitebranct/.github/workflows/website-diagnostic-measurement-29.yml@refs/heads/agent/website-diagnostic-measurement-29',payload:{created:true,deleted:false,forced:false,before:'0'.repeat(40),after:'b'.repeat(40),ref:'refs/heads/agent/website-diagnostic-measurement-29'}};
test('new attempt is distinct from consumed28, initial push only, same image and limits',()=>{
 assert.equal(typeof m.authorize,'function');m.authorize(good);
 for(const mutate of [e=>e.ref='refs/heads/agent/website-canonical-measurement-28',e=>e.attempt='2',e=>e.event='workflow_dispatch',e=>e.payload.created=false]){const e=structuredClone(good);mutate(e);assert.throws(()=>m.authorize(e));}
 const p=m.commands('/var/tmp/website29-123',1001,1001);assert.equal(p.measure.timeout,2760000);assert.ok(p.measure.args.includes('--network=none'));assert.ok(p.measure.args.includes('--memory=4g'));assert.equal(p.measure.args.at(-2),'/control/website-measurement-29/executor.mjs');
});
test('collector emits three explicit unavailable records on missing data, not empty success',()=>{
 assert.equal(typeof m.collectEvidence,'function');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'website29-collect-')),receipt={code:'PREPARE_FAILED',exitCode:1};const r=m.collectEvidence(path.join(dir,'missing'),receipt);
 assert.equal(r.results.length,3);assert.ok(r.results.every(x=>x.report==='MISSING'&&x.diagnostic==='MISSING'&&x.observationCount===null));assert.equal(receipt.exitCode,1);
});
test('collector exports allowed diagnostic on failed run and strips error/site/token sentinels',()=>{
 assert.equal(typeof m.collectEvidence,'function');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'website29-safe-'));
 const t=createTrace('webkit',()=>{},()=>0),a=t.begin('after-open');t.end(a,'TIMEOUT',t.tag(new Error('SECRET_CANARY'),'DRAWER_DEADLINE'));t.finish();
 fs.writeFileSync(path.join(dir,'responsive-webkit.json.diagnostic.json'),JSON.stringify(t.snapshot()));
 fs.writeFileSync(path.join(dir,'responsive-webkit.json'),JSON.stringify({observations:[{html:'SECRET_CANARY'}],menuResults:[],execution:{complete:false,infrastructureErrors:['SECRET_CANARY'],actions:[{status:'TIMEOUT',message:'SECRET_CANARY'}],semanticTests:[]}}));
 const r=m.collectEvidence(dir,{exitCode:1});assert.equal(r.results[2].trace.failure.category,'DRAWER_DEADLINE');assert.ok(!JSON.stringify(r).includes('SECRET_CANARY'));
 fs.writeFileSync(path.join(dir,'responsive-webkit.json.diagnostic.json'),'{');const bad=m.collectEvidence(dir,{exitCode:1});assert.equal(bad.results[2].diagnostic,'INVALID');
});
test('preparation/infrastructure/verification/cleanup remain distinguishable with failure diagnostics',async()=>{
 assert.equal(typeof m.runOnce,'function');const make=()=>({preflight(){},reserve(){},prepare(){return {status:0};},measure(){return {status:0};},stopOwned(){},verify(){return {status:'TECHNICAL_MEASUREMENT_COMPLETE_NOT_READY'};},collect(){}});
 for(const [stage,expected]of [['prepare','PREPARE_FAILED'],['measure','MEASURE_FAILED'],['verify','INCONCLUSIVE'],['stopOwned','CLEANUP_FAILED'],['collect','ARTIFACT_FAILED']]){const io=make();io[stage]=()=>{if(['prepare','measure'].includes(stage))return {status:1};throw Error('SECRET');};const r=await m.runOnce(good,io);assert.equal(r.code,expected);assert.equal(r.exitCode,1);assert.ok(!JSON.stringify(r).includes('SECRET'));}
});
test('workflow includes only new initial ref, sealed three artifact names and always cleanup',()=>{
 const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),file=path.join(repo,'.github/workflows/website-diagnostic-measurement-29.yml');assert.ok(fs.existsSync(file));const w=JSON.parse(fs.readFileSync(file));
 assert.deepEqual(w.on,{push:{branches:['agent/website-diagnostic-measurement-29']}});assert.deepEqual(w.permissions,{contents:'read'});const j=w.jobs.measurement;assert.equal(j['timeout-minutes'],100);
 assert.equal(j.steps.filter(s=>s.run?.endsWith('/runner.mjs')).length,1);assert.ok(j.steps.some(s=>s.run?.endsWith(' recover')&&s.if.includes('always()')));const upload=j.steps.find(s=>s.uses?.startsWith('actions/upload-artifact@'));assert.equal(upload.with.path.trim().split('\n').length,3);assert.ok(upload.with.path.includes('website29-artifacts'));assert.equal(upload.with['if-no-files-found'],'error');
});

function fixtureSet(){
 const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),c=contract(),read=f=>JSON.parse(execFileSync('git',['-C',repo,'show',`${c.base}:${f}`]));
 const tr=read('fixtures/audit/f2-01-transition.json'),mx=read('fixtures/audit/f2-01-menu-evidence-matrix.json');
 const reports=c.engines.map(engine=>({schemaVersion:2,source:tr.baseSha,browser:{engine,version:{chromium:'151.0.7922.34',firefox:'153.0',webkit:'26.5'}[engine]},viewports:tr.f201.matrix.viewports,
 observations:tr.f201.matrix.routes.flatMap(route=>Object.keys(tr.f201.matrix.viewports).map(viewport=>({route,viewport,conclusion:'CONCLUSIVE',overflow:false,clientWidth:320,scrollWidth:320,header:null,smallTargets:[]}))),
 menuResults:mx.entries.map(e=>({evidenceId:e.evidenceId,route:e.route,viewport:e.viewport,focusReached:true,focusStyle:{visible:true,style:'solid',width:2},open:{expanded:'true',drawerInside:true,focusInside:true,bodyLocked:true,backgroundInert:true,closeTarget:{x:44,y:44,name:'fixture'}},closed:{expanded:'false',focusReturned:true,backgroundRestored:true,closed:true},closeButtonClosed:true,outsideClosed:true})),
 reducedMotion:{matches:true,durationsMs:[0]},execution:{complete:true,infrastructureErrors:[],semanticTests:Object.keys(tr.f201.expectedDevelopmentRed.semanticVector).map(name=>({name,status:'PASS'})),actions:mx.entries.flatMap(e=>e.actionPhases.map(phase=>({evidenceId:e.evidenceId,route:e.route,viewport:e.viewport,phase,status:'COMPLETED'})))}}));
 const patch=instrument(execFileSync('git',['-C',repo,'show',`${c.testSource}:${c.authorities[0].file}`]));
 const provenance={candidate:c.candidate,testSource:c.testSource,testBlob:c.authorities[0].blob,files:64,runtime:{packageTreeDigest:c.runtimePackages.canonicalTreeDigest,version:'1.62.0'},instrumentation:{schemaVersion:1,sourceSha256:patch.sourceSha256,executedSha256:patch.executedSha256}};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'website29-proof-')),write=(file,obj)=>fs.writeFileSync(path.join(dir,file),JSON.stringify(obj));
 write('processes.json',{provenance,processes:c.engines.map(engine=>({engine,status:0,error:null,signal:null}))});
 for(const report of reports){const engine=report.browser.engine,n=`responsive-${engine}.json`,t=createTrace(engine,()=>{},()=>0);for(const a of report.execution.actions){const action=t.begin(a.phase);t.end(action,'COMPLETED');}t.closed('browser');t.closed('server');t.finish();write(n,report);write(n+'.diagnostic.json',t.snapshot());write(n+'.isolation.json',{engine,attempts:[],violations:[],boundary:'NETWORK_NONE_REQUIRED'});fs.writeFileSync(path.join(dir,n+'.log'),'');}
 write('result.json',{...validateReports(repo,reports),provenance});return {repo,dir,write};
}
test('success requires recomputed semantic84/41/184, three engines AND bound diagnostics, not counts alone',()=>{
 const {repo,dir,write}=fixtureSet();assert.equal(m.verifyEvidence(repo,dir).status,'TECHNICAL_MEASUREMENT_COMPLETE_NOT_READY');
 for(const [file,change]of [
 ['responsive-webkit.json.diagnostic.json',x=>x.finished=false],
 ['responsive-webkit.json.diagnostic.json',x=>x.actions.pop()],
 ['responsive-webkit.json.diagnostic.json',x=>x.actions[2].phase='open'],
 ['responsive-webkit.json.diagnostic.json',x=>x.shutdown.server='NOT_CONFIRMED'],
 ['responsive-webkit.json',x=>x.execution.semanticTests[0].status='FAIL'],
 ['responsive-webkit.json',x=>x.observations[0].overflow=true],
 ['processes.json',x=>x.provenance.instrumentation.executedSha256='0'.repeat(64)],
 ['result.json',x=>x.approval=true],
 ]){const raw=fs.readFileSync(path.join(dir,file)),x=JSON.parse(raw);change(x);write(file,x);assert.throws(()=>m.verifyEvidence(repo,dir));fs.writeFileSync(path.join(dir,file),raw);}
 fs.renameSync(path.join(dir,'responsive-webkit.json.diagnostic.json'),path.join(dir,'absent.json'));assert.throws(()=>m.verifyEvidence(repo,dir));
});
test('actual CLI recovery collects even when Docker stop fails after main interruption',async()=>{
 const file=path.join(path.dirname(fileURLToPath(import.meta.url)),'runner.mjs'),code=fs.readFileSync(file,'utf8');
 const branch=code.slice(code.indexOf("  if(process.argv[2]==='recover')"),code.indexOf('\n  else {assert.equal(process.argv.length'));
 let stopped=0,collected=0,receipt;const io={stopOwned(){stopped++;throw Error('DOCKER_PRIVATE');},collect(r){collected++;receipt=r;}};
 const context={process:{argv:['node','runner','recover'],exitCode:0},event:{runId:'123',workspace:'/workspace'},io,path,fs:{existsSync:f=>!f.endsWith('metadata.json')},recover:m.recover};
 try{await vm.runInNewContext(`(async()=>{${branch}})()`,context);}catch{}
 assert.equal(stopped,1);assert.equal(collected,1,'cleanup failure must not suppress sidecar export');assert.equal(receipt.cleanup,'FAILED');assert.equal(receipt.exitCode,1);assert.ok(!JSON.stringify(receipt).includes('PRIVATE'));
});
test('recovery preserves existing evidence unless cleanup fails; collection failure is never success',()=>{
 let collected=0,last;const io={stopOwned(){},collect:r=>{collected++;last=r;}};
 assert.equal(m.recover(io,{ownedExists:true,metadataExists:true}).exitCode,0);assert.equal(collected,0);
 io.stopOwned=()=>{throw Error('PRIVATE');};assert.equal(m.recover(io,{ownedExists:true,metadataExists:true,priorCode:'MEASURE_FAILED'}).exitCode,1);assert.equal(last.priorCode,'MEASURE_FAILED');assert.equal(last.cleanup,'FAILED');assert.equal(collected,1);
 io.collect=()=>{throw Error('PRIVATE');};const r=m.recover(io,{ownedExists:true,metadataExists:false,priorCode:'PRIVATE'});assert.equal(r.code,'ARTIFACT_FAILED');assert.equal(r.exitCode,1);assert.equal(r.priorCode,'UNKNOWN');
});
