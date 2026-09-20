// Controller30 admission/materialization tests. No browser/Docker/network is run.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import * as m from './runner.mjs';
import vm from 'node:vm';import {createHash} from 'node:crypto';
const repo=fileURLToPath(new URL('../../../',import.meta.url)),sha=execFileSync('git',['-C',repo,'rev-parse','HEAD']).toString().trim();
const good=()=>({repository:'branctstudio-rgb/sitebranct',event:'push',ref:'refs/heads/agent/website-sampling-boundary-30',sha,workflowSha:sha,attempt:'1',runId:'987',workflowRef:'branctstudio-rgb/sitebranct/.github/workflows/website-sampling-boundary-30.yml@refs/heads/agent/website-sampling-boundary-30',payload:{created:true,deleted:false,forced:false,before:'0'.repeat(40),after:sha,ref:'refs/heads/agent/website-sampling-boundary-30'}});
test('controller30 admits only its initial exact workflow/head, never consumed29',()=>{
 m.authorize(good());
 for(const mutate of [e=>e.ref='refs/heads/agent/website-diagnostic-measurement-29',e=>e.workflowRef=e.workflowRef.replace('sampling-boundary-30.yml','diagnostic-measurement-29.yml'),e=>e.workflowSha='0'.repeat(40),e=>delete e.workflowSha,e=>e.payload.after='f'.repeat(40),e=>e.payload.ref='refs/heads/main',e=>e.payload.before=sha,e=>e.attempt='2',e=>e.event='workflow_dispatch',e=>e.payload.forced=true,e=>e.payload.deleted=true,e=>e.payload.created=false]){const e=good();mutate(e);assert.throws(()=>m.authorize(e));}
 const commands=m.commands('/var/tmp/website30-987',1001,1001);assert.equal(commands.prepare.timeout,900000);assert.equal(commands.measure.timeout,2760000);assert.ok(commands.measure.args.includes('--network=none'));assert.ok(commands.measure.args.includes('website30.run=987'));assert.throws(()=>m.commands('/var/tmp/website29-987',1001,1001));
});
test('controller30 receipt is exact Git materialization and rejects missing or substituted modules',()=>{
 assert.equal(typeof m.materializeController,'function');assert.equal(typeof m.verifyController,'function');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'controller30-'));
 const receipt=m.materializeController(repo,dir,sha);assert.equal(receipt.domain,'WEBSITE30');assert.equal(receipt.controller,sha);assert.equal(receipt.diagnosticSchema,2);assert.equal(receipt.milestone,'425b0f31902fc475817ae4d5cf6dc59b1d146fc6');assert.equal(receipt.controller29,'0ac5802a4a06a8cc75925f9f58a566b1553a60cb');assert.equal(receipt.modules.length,5);
 assert.deepEqual(m.verifyController(repo,dir,sha),receipt);
 for(const item of receipt.modules){const file=path.join(dir,'website-measurement-29',item.name),b=fs.readFileSync(file);assert.deepEqual(b,execFileSync('git',['-C',repo,'show',sha+':scripts/governance/website-measurement-29/'+item.name]));fs.writeFileSync(file,Buffer.concat([b,Buffer.from('\n')]));assert.throws(()=>m.verifyController(repo,dir,sha));fs.writeFileSync(file,b);}
 const file=path.join(dir,'controller30.json'),bytes=fs.readFileSync(file);fs.writeFileSync(file,'{');assert.throws(()=>m.verifyController(repo,dir,sha));fs.writeFileSync(file,bytes);
 const forged=JSON.parse(bytes);forged.controller='f'.repeat(40);fs.writeFileSync(file,JSON.stringify(forged));assert.throws(()=>m.verifyController(repo,dir,sha));fs.writeFileSync(file,bytes);
 fs.renameSync(file,file+'.missing');assert.throws(()=>m.verifyController(repo,dir,sha));fs.renameSync(file+'.missing',file);
 for(const ref of ['',undefined,'HEAD','f'.repeat(40),'0ac5802a4a06a8cc75925f9f58a566b1553a60cb'])assert.throws(()=>m.controllerReceipt(repo,ref));
});
test('controller30 never reaches measure on admission/preparation failure and always reports cleanup failure',async()=>{
 const calls=[];const io={preflight:()=>calls.push('preflight'),reserve:()=>calls.push('reserve'),prepare:()=>{calls.push('prepare');return {status:1};},measure:()=>{calls.push('measure');return {status:0};},stopOwned:()=>calls.push('stop'),verify:()=>{throw Error('must not verify');},collect:()=>calls.push('collect')};
 const r=await m.runOnce(good(),io);assert.equal(r.code,'PREPARE_FAILED');assert.deepEqual(calls,['preflight','reserve','prepare','stop','collect']);
 calls.length=0;const old=good();old.ref='refs/heads/agent/website-diagnostic-measurement-29';const rejected=await m.runOnce(old,io);assert.equal(rejected.exitCode,1);assert.deepEqual(calls,['collect']);
 calls.length=0;io.stopOwned=()=>{calls.push('stop');throw Error('private');};const failed=await m.runOnce(good(),io);assert.equal(failed.code,'CLEANUP_FAILED');assert.equal(failed.exitCode,1);assert.ok(!calls.includes('measure'));assert.equal(calls.at(-1),'collect');
});

test('controller30 closes remote main/history admission before reserving an attempt',()=>{
 assert.equal(typeof m.validateRemoteState,'function');const e=good(),base={object:{sha:'851c1723119b62193623fa24e67090afd18b39f1'}},history={total_count:1,workflow_runs:[{id:987,head_sha:sha,run_attempt:1,event:'push',head_branch:'agent/website-sampling-boundary-30',path:'.github/workflows/website-sampling-boundary-30.yml'}]};m.validateRemoteState(base,history,e);
 for(const mutate of [x=>x.total_count=2,x=>x.workflow_runs.push({...x.workflow_runs[0]}),x=>x.workflow_runs=[],x=>x.workflow_runs[0].head_sha='f'.repeat(40),x=>x.workflow_runs[0].id=123,x=>x.workflow_runs[0].run_attempt=2,x=>x.workflow_runs[0].path='.github/workflows/website-diagnostic-measurement-29.yml',x=>x.workflow_runs[0].event='workflow_dispatch',x=>x.workflow_runs[0].head_branch='main']){const x=structuredClone(history);mutate(x);assert.throws(()=>m.validateRemoteState(base,x,e));}
 assert.throws(()=>m.validateRemoteState({object:{sha}},history,e));assert.throws(()=>m.validateRemoteState(base,{},e));
});

test('controller30 workflow uses pushed head, immutable data checkouts and exclusive trigger/export',()=>{
 const w=JSON.parse(fs.readFileSync(path.join(repo,'.github/workflows/website-sampling-boundary-30.yml'))),j=w.jobs.measurement;
 assert.deepEqual(w.on,{push:{branches:['agent/website-sampling-boundary-30']}});assert.deepEqual(w.permissions,{contents:'read'});assert.deepEqual(w.concurrency,{group:'website-sampling-boundary-30','cancel-in-progress':false});
 assert.equal(j['timeout-minutes'],100);assert.equal(j.if,"${{ github.event.created == true && github.event.deleted == false && github.event.forced == false && github.run_attempt == 1 }}");
 const checkout=j.steps.filter(s=>s.uses?.startsWith('actions/checkout@'));assert.deepEqual(checkout.map(s=>s.with.ref),['${{ github.sha }}','2fbce7cdd1ff87f9a54d8c9190ffd1f349a8fe9d','563f3c13665347b2a8578110e519ebaf13f356e8']);assert.ok(checkout.every(s=>s.with['persist-credentials']===false&&s.with['fetch-depth']===0));
 assert.equal(j.steps.filter(s=>s.run?.endsWith('/runner.mjs')).length,1);assert.equal(j.steps.find(s=>s.run?.endsWith('/runner.mjs'))['timeout-minutes'],85);assert.equal(j.steps.find(s=>s.run?.endsWith(' recover'))['timeout-minutes'],3);
 const upload=j.steps.find(s=>s.uses?.startsWith('actions/upload-artifact@'));assert.equal(upload.with.overwrite,false);assert.deepEqual(upload.with.path.trim().split('\n'),['metadata.json','results.json','hashes.json'].map(n=>'${{ github.workspace }}/website30-artifacts/'+n));
 for(const step of j.steps.filter(s=>s.uses))assert.match(step.uses,/@[0-9a-f]{40}$/);
 // Interpret the checkout expression with the trusted push event, then feed the
 // resulting workflow/head identities through the real controller admission.
 const event=good();const resolved=checkout[0].with.ref.replace('${{ github.sha }}',event.sha);assert.equal(resolved,sha);m.authorize({...event,workflowSha:resolved});assert.throws(()=>m.authorize({...event,workflowSha:'0'.repeat(40)}));
});

test('controller30 export distinguishes observed receipt from expected, invalid and missing evidence',()=>{
 assert.equal(typeof m.collectController,'function');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'controller30-export-')),file=path.join(dir,'processes.json'),expected=m.controllerReceipt(repo,sha);
 const missing={code:'MEASURED_NOT_RELEASED',exitCode:0};assert.equal(m.collectController(dir,repo,sha,missing).status,'MISSING');assert.equal(missing.exitCode,1);assert.equal(missing.code,'INCONCLUSIVE');
 fs.writeFileSync(file,JSON.stringify({provenance:{controller:expected}}));const good={code:'MEASURED_NOT_RELEASED',exitCode:0};assert.deepEqual(m.collectController(dir,repo,sha,good),{status:'MATCH',expected,observed:expected});assert.equal(good.exitCode,0);
 for(const bytes of ['{',JSON.stringify({provenance:{controller:{...expected,domain:'WEBSITE29'}}})]){fs.writeFileSync(file,bytes);const r={code:'MEASURED_NOT_RELEASED',exitCode:0},x=m.collectController(dir,repo,sha,r);assert.equal(x.status,'INVALID');assert.equal(x.observed,null);assert.equal(r.exitCode,1);}
});

test('controller30 workflow-SHA and materialized-byte guards are load-bearing in LF and CRLF',()=>{
 const source=fs.readFileSync(new URL('./runner.mjs',import.meta.url),'utf8');
 for(const eol of ['\n','\r\n']){
  const code=source.replace(/\r\n|\r|\n/g,eol),start=code.indexOf('export function authorize('),end=code.indexOf('export function validateRemoteState(');
  const original=code.slice(start,end).replace('export function','function'),mutated=original.replace("check(e.workflowSha===e.sha&&e.sha!=='0'.repeat(40),'WORKFLOW_HEAD');",'');assert.notEqual(original,mutated);
  const context={assert,pins:m.pins,check:(v,c)=>assert.ok(v,c)};const admit=vm.runInNewContext(mutated+'\nauthorize;',context),e=good();e.workflowSha='0'.repeat(40);assert.throws(()=>m.authorize(e));assert.doesNotThrow(()=>admit(e));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'controller30-mutation-')),receipt=m.materializeController(repo,root,sha),f=path.join(root,'website-measurement-29',receipt.modules[0].name),b=fs.readFileSync(f);b[0]^=1;fs.writeFileSync(f,b);
  const verify=code.slice(code.indexOf('export function verifyController('),code.indexOf('export function collectController(')).replace('export function','function');const weakened=verify.replace("assert.equal(hash(b),item.sha256,'CONTROLLER_DIGEST');",'');assert.notEqual(verify,weakened);
  const verifyMutant=vm.runInNewContext(weakened+'\nverifyController;',{assert,fs,path,controllerReceipt:m.controllerReceipt,safeJson:m.safeJson,safeBytes:m.safeBytes,controllerModules:receipt.modules.map(x=>x.name),hash:b=>createHash('sha256').update(b).digest('hex'),check:(v,c)=>assert.ok(v,c)});
  assert.throws(()=>m.verifyController(repo,root,sha),/CONTROLLER_DIGEST/);assert.doesNotThrow(()=>verifyMutant(repo,root,sha));
 }
});
