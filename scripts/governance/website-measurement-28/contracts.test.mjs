import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';
import {contract} from '../website-candidate-27/admission.mjs';import {validateReports} from '../website-candidate-27/executor.mjs';
const m=await import('./runner.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const good={repository:'branctstudio-rgb/sitebranct',event:'push',ref:'refs/heads/agent/website-canonical-measurement-28',sha:'b'.repeat(40),attempt:'1',runId:'123',workflowRef:'branctstudio-rgb/sitebranct/.github/workflows/website-canonical-measurement-28.yml@refs/heads/agent/website-canonical-measurement-28',payload:{created:true,deleted:false,forced:false,before:'0'.repeat(40),after:'b'.repeat(40),ref:'refs/heads/agent/website-canonical-measurement-28'}};
test('only initial exact branch push can authorize a single attempt, not PR/dispatch/rerun',()=>{
 assert.equal(typeof m.authorize,'function');assert.doesNotThrow(()=>m.authorize(good));
 for(const mutate of [c=>c.event='pull_request',c=>c.event='workflow_dispatch',c=>c.attempt='2',c=>c.ref='refs/heads/main',c=>c.repository='elsewhere/site',c=>c.payload.created=false,c=>c.payload.forced=true,c=>c.payload.before='a'.repeat(40),c=>c.payload.after='a'.repeat(40),c=>c.workflowRef+='x',c=>c.sha='HEAD']){const c=structuredClone(good);mutate(c);assert.throws(()=>m.authorize(c));}
});
test('Docker measurement command fixes network, identity, image, mounts and budget without host secrets',()=>{
 assert.equal(typeof m.commands,'function');const p=m.commands('/var/tmp/website28-123',1001,1001);
 const a=p.measure.args;assert.ok(a.includes('--network=none'));assert.ok(a.includes('--pull=never'));assert.ok(a.includes('--read-only'));assert.ok(a.includes('--cap-drop=ALL'));assert.ok(a.includes('--pids-limit=512'));assert.ok(a.includes('--memory=4g'));assert.ok(a.includes('--cpus=2'));assert.ok(a.includes('--shm-size=1g'));assert.equal(p.measure.timeout,2760000);
 assert.equal(a.at(-3),'node');assert.equal(a.at(-2),'/control/executor.mjs');assert.equal(a.at(-1),'container');assert.ok(a.includes('mcr.microsoft.com/playwright@sha256:02bbb2155cd7109e3e9c741941097ed1608cf8b6fa44ee2595896da2bdc1f471'));
 assert.equal(a.filter(x=>x.startsWith('type=bind')).length,4);assert.ok(a.filter(x=>x.startsWith('type=bind')&&!x.includes('dst=/outputs')).every(x=>x.endsWith(',readonly')));assert.ok(!a.join(' ').match(/docker.sock|TOKEN|SECRET|--privileged|--network=host/));
 for(const r of ['/', '/var/tmp/../etc','/tmp/x,readonly','relative'])assert.throws(()=>m.commands(r,1001,1001));
});
test('image facts must resolve exact digest Linux amd64; missing/different image is not fallback',()=>{
 assert.equal(typeof m.validateImage,'function');const i={Os:'linux',Architecture:'amd64',RepoDigests:['mcr.microsoft.com/playwright@sha256:02bbb2155cd7109e3e9c741941097ed1608cf8b6fa44ee2595896da2bdc1f471']};assert.doesNotThrow(()=>m.validateImage([i]));
 for(const a of [[],[i,i],[{...i,Os:'windows'}],[{...i,RepoDigests:[]}],[{...i,Architecture:'arm64'}]])assert.throws(()=>m.validateImage(a));
});
test('launcher runs once then cleanup, rejects timeout/signal/absent evidence/dirty resources',async()=>{
 assert.equal(typeof m.runOnce,'function');
 const make=()=>{const calls=[];return {calls,preflight(){calls.push('preflight');},reserve(){calls.push('reserve');},prepare(){calls.push('prepare');return {status:0};},measure(){calls.push('measure');return {status:0};},stopOwned(){calls.push('stop');},verify(){calls.push('verify');return {status:'TECHNICAL_MEASUREMENT_COMPLETE_NOT_READY'};},collect(r){calls.push('collect');return r;}};};
 const ok=make();assert.equal((await m.runOnce(good,ok)).code,'MEASURED_NOT_RELEASED');assert.deepEqual(ok.calls,['preflight','reserve','prepare','measure','stop','verify','collect']);
 for(const change of [io=>io.prepare=()=>({status:1}),io=>io.measure=()=>({status:null,error:{code:'ETIMEDOUT'}}),io=>io.measure=()=>({status:0,signal:'SIGTERM'}),io=>io.verify=()=>{throw Error('MISSING_REPORT');},io=>io.stopOwned=()=>{throw Error('OWNER');},io=>io.preflight=()=>{throw Error('DRIFT');}]){const io=make();change(io);const r=await m.runOnce(good,io);assert.equal(r.exitCode,1);assert.notEqual(r.code,'MEASURED_NOT_RELEASED');assert.ok(io.calls.includes('collect'));}
});
test('receipt cannot promote exit zero without all three exact process outcomes',()=>{
 assert.equal(typeof m.validateProcesses,'function');const p={processes:['chromium','firefox','webkit'].map(engine=>({engine,status:0,error:null,signal:null}))};assert.doesNotThrow(()=>m.validateProcesses(p));
 for(const mutate of [p=>p.processes.pop(),p=>p.processes.reverse(),p=>p.processes[1]=p.processes[0],p=>p.processes[0].status=null,p=>p.processes[0].error='ETIMEDOUT',p=>p.processes[0].signal='SIGTERM']){const v=structuredClone(p);mutate(v);assert.throws(()=>m.validateProcesses(v));}
});
test('collector refuses link/oversize/unknown output and never exports arbitrary browser strings',()=>{
 assert.equal(typeof m.safeJson,'function');const d=fs.mkdtempSync(path.join(os.tmpdir(),'website28-json-'));fs.writeFileSync(path.join(d,'good.json'),'{"a":1}');assert.deepEqual(m.safeJson(path.join(d,'good.json')),{a:1});fs.writeFileSync(path.join(d,'bad.json'),'{');assert.throws(()=>m.safeJson(path.join(d,'bad.json')));assert.throws(()=>m.safeJson(path.join(d,'good.json'),1));
 assert.equal(typeof m.projectDiagnostic,'function');const r=m.projectDiagnostic({browser:{engine:'chromium',version:'TOKEN'},execution:{complete:false,actions:[{phase:'open',status:'TIMEOUT',secret:'private'}],infrastructureErrors:['private']},observations:[],menuResults:[],private:'private'},'chromium');assert.ok(!JSON.stringify(r).includes('private'));assert.ok(!JSON.stringify(r).includes('TOKEN'));assert.equal(r.complete,false);assert.equal(r.actionCount,1);
});

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../..');
test('workflow cannot double measure on PR or dispatch and fails if proof artifacts are missing',()=>{
 const workflow=JSON.parse(fs.readFileSync(path.join(repo,'.github/workflows/website-canonical-measurement-28.yml')));
 assert.deepEqual(workflow.on,{push:{branches:['agent/website-canonical-measurement-28']}});assert.deepEqual(workflow.permissions,{contents:'read'});
 const j=workflow.jobs.measurement;assert.equal(j['timeout-minutes'],100);assert.equal(j['runs-on'],'ubuntu-24.04');assert.equal(j.steps.filter(s=>s.run?.endsWith('/runner.mjs')).length,1);
 const upload=j.steps.find(s=>s.uses?.startsWith('actions/upload-artifact@'));assert.equal(upload.with['if-no-files-found'],'error');assert.equal(upload.with['retention-days'],7);assert.equal(upload.with.path.trim().split('\n').length,3);assert.ok(!upload.with.path.includes('**'));assert.ok(j.steps.some(s=>s.run?.endsWith('/runner.mjs recover')&&s.if.includes('always()')));
 for(const s of j.steps.filter(s=>s.uses)){assert.match(s.uses,/@[0-9a-f]{40}$/);if(s.uses.startsWith('actions/checkout'))assert.equal(s.with['persist-credentials'],false);}
});
test('real evidence verifier rejects missing, unknown, duplicate-process and status-zero evidence',()=>{
 assert.equal(typeof m.verifyEvidence,'function');const d=fs.mkdtempSync(path.join(os.tmpdir(),'website28-empty-'));assert.throws(()=>m.verifyEvidence(repo,d),/CLOSED_OUTPUT/);fs.writeFileSync(path.join(d,'unexpected.json'),'{}');assert.throws(()=>m.verifyEvidence(repo,d),/CLOSED_OUTPUT/);
});

// Closed synthetic fixtures test host verification only; never published as measured proof.
function completeSynthetic(engine){
 const read=file=>JSON.parse(execFileSync('git',['-C',repo,'show',`${contract().base}:${file}`]));
 const transition=read('fixtures/audit/f2-01-transition.json'),matrix=read('fixtures/audit/f2-01-menu-evidence-matrix.json');
 return {schemaVersion:2,source:'a47abb9a43248320dfef8449b6a65e187913fd24',browser:{engine,version:{chromium:'151.0.7922.34',firefox:'153.0',webkit:'26.5'}[engine]},viewports:transition.f201.matrix.viewports,
 observations:transition.f201.matrix.routes.flatMap(route=>Object.keys(transition.f201.matrix.viewports).map(viewport=>({route,viewport,conclusion:'CONCLUSIVE',overflow:false,clientWidth:Number(viewport.split('x')[0]),scrollWidth:Number(viewport.split('x')[0]),header:null,smallTargets:[]}))),
 menuResults:matrix.entries.map(e=>({evidenceId:e.evidenceId,route:e.route,viewport:e.viewport,focusReached:true,focusStyle:{visible:true,style:'solid',width:2},open:{expanded:'true',drawerInside:true,focusInside:true,bodyLocked:true,backgroundInert:true,closeTarget:{x:44,y:44,name:'synthetic'}},closed:{expanded:'false',focusReturned:true,backgroundRestored:true,closed:true},closeButtonClosed:true,outsideClosed:true})),
 reducedMotion:{matches:true,durationsMs:[0]},execution:{complete:true,infrastructureErrors:[],actions:matrix.entries.flatMap(e=>e.actionPhases.map(phase=>({evidenceId:e.evidenceId,route:e.route,viewport:e.viewport,phase,status:'COMPLETED'}))),semanticTests:Object.keys(transition.f201.expectedDevelopmentRed.semanticVector).map(name=>({name,status:'PASS'}))}};
}
test('complete host proof is recomputed; missing engine, raw/result tampering and isolated exit0 cannot pass',()=>{
 const c=contract(),d=fs.mkdtempSync(path.join(os.tmpdir(),'website28-proof-')),reports=c.engines.map(completeSynthetic);
 const provenance={candidate:c.candidate,testSource:c.testSource,testBlob:c.authorities[0].blob,files:64,runtime:{packageTreeDigest:c.runtimePackages.canonicalTreeDigest,version:'1.62.0'}};
 const write=(name,x)=>fs.writeFileSync(path.join(d,name),JSON.stringify(x));
 const p={provenance,processes:c.engines.map(engine=>({engine,status:0,error:null,signal:null}))};write('processes.json',p);
 for(const [i,engine]of c.engines.entries()){write(`responsive-${engine}.json`,reports[i]);write(`responsive-${engine}.json.isolation.json`,{engine,attempts:[],violations:[],boundary:'NETWORK_NONE_REQUIRED'});fs.writeFileSync(path.join(d,`responsive-${engine}.json.log`),'');}
 const result={...validateReports(repo,reports),provenance};write('result.json',result);assert.equal(m.verifyEvidence(repo,d).counts.observationsPerEngine,84);
 for(const [name,bad]of [['result.json',{...result,approval:true}],['processes.json',{...p,processes:p.processes.slice(1)}],['processes.json',{...p,provenance:{...provenance,candidate:c.testSource}}],['responsive-firefox.json',{...reports[1],browser:{engine:'webkit',version:'26.5'}}],['responsive-firefox.json.isolation.json',{engine:'firefox',attempts:[{}],violations:[],boundary:'NETWORK_NONE_REQUIRED'}]]){const b=fs.readFileSync(path.join(d,name));write(name,bad);assert.throws(()=>m.verifyEvidence(repo,d));fs.writeFileSync(path.join(d,name),b);}
 const file=path.join(d,'responsive-webkit.json'),b=fs.readFileSync(file);fs.writeFileSync(file,b.subarray(0,50));assert.throws(()=>m.verifyEvidence(repo,d));fs.writeFileSync(file,b);
 fs.writeFileSync(path.join(d,'extra.json'),'{}');assert.throws(()=>m.verifyEvidence(repo,d),/CLOSED_OUTPUT/);
});
test('load-bearing event, image, process proof and zero-exit guards mutate non-vacuously in LF/CRLF',async()=>{
 const checks=[
 ["e.attempt==='1'&&","",async x=>assert.throws(()=>x.authorize({...good,attempt:'2'}))],
 ["check(i.RepoDigests?.includes(c.image),'IMAGE_DIGEST');","",async x=>assert.throws(()=>x.validateImage([{Os:'linux',Architecture:'amd64',RepoDigests:[]}]))],
 ["assert.deepEqual(p?.processes,c.engines.map(engine=>({engine,status:0,error:null,signal:null})),'PROCESS_SET');","",async x=>assert.throws(()=>x.validateProcesses({processes:[]}))],
 ["check(r.proof.status==='TECHNICAL_MEASUREMENT_COMPLETE_NOT_READY','PROOF_MISSING');","",async x=>{const io={preflight(){},reserve(){},prepare(){return {status:0};},measure(){return {status:0};},stopOwned(){},verify(){return {status:'INCONCLUSIVE'};},collect(){}};assert.equal((await x.runOnce(good,io)).exitCode,1);}]
 ];
 for(const eol of ['\n','\r\n'])for(const [needle,replacement,check]of checks){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'website28-mutation-'));fs.mkdirSync(path.join(dir,'website-measurement-28'));fs.cpSync(path.join(here,'../website-candidate-27'),path.join(dir,'website-candidate-27'),{recursive:true});const text=fs.readFileSync(path.join(here,'runner.mjs'),'utf8').replace(/\r?\n/g,eol);assert.equal(text.split(needle).length,2);const changed=text.replace(needle,replacement);assert.notEqual(text,changed);const file=path.join(dir,'website-measurement-28/runner.mjs');fs.writeFileSync(file,changed);const mutant=await import(pathToFileURL(file));await assert.rejects(()=>check(mutant));}
});
