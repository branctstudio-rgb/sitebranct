// Version29 orchestration; immutable27 continues to own payload and semantic validation.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {contract,hash} from '../website-candidate-27/admission.mjs';
import {plan,materialize,validateReports} from '../website-candidate-27/executor.mjs';
import {inspectRuntime,copyExistingRuntime} from '../website-candidate-27/runtime.mjs';
import {instrument} from './instrument.mjs';import {createTrace,validateDiagnosticAgainstReport} from './diagnostics.mjs';
const c=contract(),here=path.dirname(fileURLToPath(import.meta.url));
export function containerEntry(){
  assert.equal(process.platform,'linux','LINUX_RUNTIME_REQUIRED');assert.equal(process.arch,'x64');
  assert.deepEqual(Object.keys(os.networkInterfaces()).filter(n=>n!=='lo'),[],'NETWORK_NAMESPACE_REQUIRED');
  assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH,'/ms-playwright');
  assert.ok(!fs.existsSync('/outputs/measurement'),'FRESH_OUTPUT');
  const repo='/repository',source='/tmp/website27-candidate',schedule=plan(repo,{candidate:c.candidate,engines:c.engines,image:c.image,limits:c.limits});
  inspectRuntime(repo,'/deps');const provenance=materialize(repo,source);provenance.runtime=copyExistingRuntime(repo,'/deps',source);
  const file=path.join(source,c.authorities[0].file),patch=instrument(fs.readFileSync(file));
  fs.writeFileSync(file,patch.code);assert.equal(hash(fs.readFileSync(file)),patch.executedSha256);
  provenance.instrumentation={schemaVersion:1,sourceSha256:patch.sourceSha256,executedSha256:patch.executedSha256};
  fs.mkdirSync('/outputs/measurement');const reports=[],processes=[];
  for(const t of schedule.tasks){
    const report=`/outputs/measurement/${t.report}`;
    createTrace(t.engine,d=>fs.writeFileSync(report+'.diagnostic.json',JSON.stringify(d)));
    const p=spawnSync(process.execPath,[path.join(here,'browser.mjs')],{cwd:source,encoding:'utf8',timeout:t.timeout,maxBuffer:32*1024*1024,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',TMPDIR:'/tmp',LANG:'C.UTF-8',PLAYWRIGHT_BROWSERS_PATH:'/ms-playwright',PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',F2_01_BROWSER:t.engine,F2_01_REPORT_PATH:report},windowsHide:true});
    fs.writeFileSync(report+'.log',(p.stdout||'')+(p.stderr||''),{flag:'wx'});processes.push({engine:t.engine,status:p.status,error:p.error?.code??null,signal:p.signal??null});
    fs.writeFileSync('/outputs/measurement/processes.json',JSON.stringify({provenance,processes},null,2)+'\n');
    assert.equal(p.status,0,'CHILD_NONZERO');assert.equal(p.error,undefined,'CHILD_ERROR');assert.equal(p.signal,null,'CHILD_SIGNAL');
    const isolation=JSON.parse(fs.readFileSync(report+'.isolation.json'));assert.deepEqual(isolation,{engine:t.engine,attempts:[],violations:[],boundary:'NETWORK_NONE_REQUIRED'},'ISOLATION_FAILED');
    const raw=JSON.parse(fs.readFileSync(report));
    validateDiagnosticAgainstReport(JSON.parse(fs.readFileSync(report+'.diagnostic.json')),raw,t.engine);
    reports.push(raw);
  }
  const result=validateReports(repo,reports);fs.writeFileSync('/outputs/measurement/result.json',JSON.stringify({...result,provenance},null,2)+'\n',{flag:'wx'});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{assert.equal(process.argv[2],'container','CONTAINER_COMMAND_REQUIRED');console.log(JSON.stringify(containerEntry()));}
  catch(e){console.error(`MEASUREMENT_REJECTED: ${e.message}`);process.exitCode=1;}
}
