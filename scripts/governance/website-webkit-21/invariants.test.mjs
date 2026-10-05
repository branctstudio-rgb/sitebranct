import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync,spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import {fileURLToPath,pathToFileURL} from 'node:url';
import {authorize,projectJson} from './runner.mjs';import {runWebKit} from './package/linux-run.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=process.env.WEBSITE21_CANONICAL_REPO||path.resolve(here,'../../..'),pins=JSON.parse(fs.readFileSync(path.join(here,'source-package.json'))),base='851c1723119b62193623fa24e67090afd18b39f1';
const git=args=>execFileSync('git',['-c',`safe.directory=${repo.replaceAll('\\','/')}`,'-C',repo,...args]),hash=b=>createHash('sha256').update(b).digest('hex');
test('full canonical application test and matrix are unchanged Git blobs, including every deadline/action',()=>{
 for(const file of ['tests/audit/f2-01-responsive.test.mjs','fixtures/audit/site-contract.json']){
  const pin=pins.sourceFiles.find(f=>f.file===file);const b=git(['cat-file','blob',`${pins.sourceHead}:${file}`]);
  assert.equal(hash(b),pin.sha256);assert.equal(git(['rev-parse',`${pins.sourceHead}:${file}`]).toString().trim(),pin.blob);
 }
 const b=git(['cat-file','blob',`${pins.sourceHead}:tests/audit/f2-01-responsive.test.mjs`]).toString();
 // Mechanical source characterization, not execution proof. The whole source is pinned above.
 for(const required of ['"1024x768": [1024, 768]','timeout: 10000','performance.now() + 2500','timeout = 3000','evidenceActionPhases','site.routes','verifyDrawerSynchronization(engines[engineName])'])assert.ok(b.includes(required));
});
test('adapter is mechanically identical to approved boundary except restricting engine to WebKit',()=>{
 const b=git(['cat-file','blob',`${base}:scripts/governance/website-linux-13/package12/linux-responsive.mjs`]).toString();
 const guard="assert.ok(['chromium','firefox','webkit'].includes(engine))";
 assert.equal(b.split(guard).length,2);
 assert.equal(fs.readFileSync(path.join(here,'package/linux-responsive.mjs'),'utf8').replace(/\r\n/g,'\n'),b.replace(guard,"assert.equal(engine,'webkit')"));
});
const wf=JSON.parse(fs.readFileSync(path.join(repo,'.github/workflows/website-webkit-diagnostic-21.yml')));
const guard=wf.jobs.diagnostic.steps[0].run.split("<<'NODE'\n")[1].split('\nNODE\n')[0];
const context=()=>({event:'workflow_dispatch',repository:pins.repository,ref:'refs/heads/main',workflowRef:`${pins.repository}/.github/workflows/website-webkit-diagnostic-21.yml@refs/heads/main`,sha:'a'.repeat(40),wrapperSha:'a'.repeat(40),runId:'123',attempt:'1',authorizationId:'WEBSITE-WEBKIT-21-20260913-01',authorization:`AUTHORIZE WEBSITE-WEBKIT-21-20260913-01 ${'a'.repeat(40)} ${pins.sourceHead} ${pins.packageDigest}`});
function workflowGuard(c){return spawnSync(process.execPath,['--input-type=module','-e',guard],{encoding:'utf8',timeout:5000,windowsHide:true,env:{GITHUB_EVENT_NAME:c.event,GITHUB_REPOSITORY:c.repository,GITHUB_REF:c.ref,GITHUB_WORKFLOW_REF:c.workflowRef,GITHUB_RUN_ATTEMPT:c.attempt,GITHUB_SHA:c.sha,AUTH_WRAPPER_SHA:c.wrapperSha,AUTH_ID:c.authorizationId,AUTH_TEXT:c.authorization}});}
test('new workflow and real host guard accept same exact synthetic envelope without emitting an event',()=>{const c=context();assert.doesNotThrow(()=>authorize(c));assert.equal(workflowGuard(c).status,0);assert.deepEqual(wf.permissions,{contents:'read'});assert.equal(wf.jobs.diagnostic['timeout-minutes'],110);assert.equal(wf.concurrency['cancel-in-progress'],false);});
for(const [name,change] of [['consumed old ID',c=>c.authorizationId='WEBSITE-LINUX-13-20260913-01'],['attempt2',c=>c.attempt='2'],['wrong event',c=>c.event='push'],['wrong source approval',c=>c.authorization=c.authorization.replace(pins.sourceHead,'b'.repeat(40))],['wrong package',c=>c.authorization=c.authorization.replace(pins.packageDigest,'b'.repeat(64))]])test(`both guards reject ${name}`,()=>{const c=context();change(c);assert.throws(()=>authorize(c));assert.notEqual(workflowGuard(c).status,0);});
test('new workflow never calls old whole-campaign entry, artifact paths are exactly four sane files',()=>{
 assert.equal(wf.jobs.diagnostic.steps[3].run,'node control/scripts/governance/website-webkit-21/runner.mjs');
 assert.equal(wf.jobs.diagnostic.steps[4].run,'node control/scripts/governance/website-webkit-21/runner.mjs --collect-only');
 const paths=wf.jobs.diagnostic.steps[5].with.path.trim().split('\n');assert.deepEqual(paths,['metadata.json','results.json','hashes.json','technical.log'].map(n=>`${'${{ github.workspace }}'}/website-webkit-21-artifacts/${n}`));
 assert.equal(wf.jobs.diagnostic.steps[5].with['retention-days'],14);assert.equal(wf.jobs.diagnostic.steps[5].with.overwrite,false);
});
for(const eol of ['\n','\r\n'])test(`mutation changes actual selected task to Firefox and the real execution boundary detects it (${eol.length})`,async()=>{
 const source=fs.readFileSync(path.join(here,'package/linux-run.mjs'),'utf8').replace(/\r\n|\n/g,eol),from="engine:'webkit',report:";
 assert.equal(source.split(from).length,2);const mutated=source.replace(from,"engine:'firefox',report:");assert.notEqual(mutated,source);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'webkit-selection-'));const file=path.join(dir,'linux-run.mjs');fs.writeFileSync(file,mutated);const m=await import(pathToFileURL(file));
 const seen=[];const io={inspect:()=>({platform:'linux',arch:'x64',browser:'webkit',head:pins.sourceHead,tree:pins.sourceTree,clean:true,sourceFilesValid:true,playwright:'1.62.0',cache:'/ms-playwright',revisions:[['chromium','1234'],['firefox','1538'],['webkit','2336']]}),reserve(){},execute:t=>{seen.push(t.engine);return {status:1};},save(){}};
 runWebKit({...io,execute:t=>{assert.equal(t.engine,'webkit');return{status:1};}});
 m.runWebKit(io);assert.deepEqual(seen,['firefox']);assert.throws(()=>assert.deepEqual(seen,['webkit']));
});
for(const [label,from,to] of [
 ['timeout category',"status==='TIMEOUT'?'ACTION_TIMEOUT'","status==='TIMEOUT'?'ACTION_ERROR_UNSPECIFIED'"],
 ['phase privacy',"const phase=phases.includes(a?.phase)?a.phase:'UNKNOWN';","const phase=a?.phase;"],
 ['unknown default',"status:'UNKNOWN',infrastructureErrorDetail:","status:'NO_FAILURE_RECORDED',infrastructureErrorDetail:"]
])for(const eol of ['\n','\r\n'])test(`projector load-bearing ${label} (${eol.length})`,async()=>{
 const s=fs.readFileSync(path.join(here,'runner.mjs'),'utf8').replace(/\r\n|\n/g,eol);assert.equal(s.split(from).length,2);const altered=s.replace(from,to);assert.notEqual(s,altered);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'webkit-projector-'));fs.copyFileSync(path.join(here,'source-package.json'),path.join(dir,'source-package.json'));fs.writeFileSync(path.join(dir,'runner.mjs'),altered);
 const mutant=await import(pathToFileURL(path.join(dir,'runner.mjs')));
 const input=label==='timeout category'?{execution:{complete:false,infrastructureErrors:['private'],actions:[{phase:'open',status:'TIMEOUT'}]}}:label==='phase privacy'?{execution:{complete:false,infrastructureErrors:['private'],actions:[{phase:'private',status:'ERROR'}]}}:{execution:{complete:false}};
 const raw=JSON.stringify(input);assert.notDeepEqual(mutant.projectJson('responsive-webkit.json',raw),projectJson('responsive-webkit.json',raw));
});
