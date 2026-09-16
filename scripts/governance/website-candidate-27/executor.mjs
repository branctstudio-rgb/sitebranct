// Offline complement to WebKit21, not its replacement. No GitHub/approval API.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {contract,verifyCandidate,blob,hash} from './admission.mjs';
import {copyExistingRuntime,inspectRuntime} from './runtime.mjs';
const c=contract(),here=path.dirname(fileURLToPath(import.meta.url));
const authority=(repo,file)=>{const e=c.authorities.find(e=>e.file===file);assert.ok(e,'UNPINNED_AUTHORITY');return JSON.parse(blob(repo,e.source,e));};
export function plan(repo,input){
  assert.deepEqual(input,{candidate:c.candidate,engines:c.engines,image:c.image,limits:c.limits},'PLAN_CANDIDATE_ENGINE_IMAGE_LIMITS');
  verifyCandidate(repo,{base:c.base,head:input.candidate});
  return {candidate:c.candidate,candidateTree:c.candidateTree,testSource:c.testSource,testBlob:c.authorities[0].blob,network:'none',image:c.image,limits:c.limits,tasks:c.engines.map(engine=>({engine,timeout:c.limits.childTimeoutMs,report:`responsive-${engine}.json`})),approval:false,productionAuthorized:false};
}
export function validateReports(repo,reports){
  const transition=authority(repo,'fixtures/audit/f2-01-transition.json'),matrix=authority(repo,'fixtures/audit/f2-01-menu-evidence-matrix.json'),runtime=authority(repo,'fixtures/audit/f2-01-ci-runtime.json');
  assert.deepEqual(reports.map(r=>r?.browser?.engine),c.engines,'ENGINE_SET');
  const semanticNames=Object.keys(transition.f201.expectedDevelopmentRed.semanticVector);
  const tuple=(r,v)=>`${r}\0${v}`;
  const expected=transition.f201.matrix.routes.flatMap(r=>Object.keys(transition.f201.matrix.viewports).map(v=>tuple(r,v))).sort();
  for(const r of reports){
    assert.equal(r.schemaVersion,2);assert.equal(r.source,transition.baseSha,'HISTORICAL_SOURCE_LABEL');
    assert.equal(r.browser.version,runtime.playwright.browserBuilds[r.browser.engine].version,'BROWSER_VERSION');
    assert.deepEqual(r.viewports,transition.f201.matrix.viewports,'VIEWPORTS');
    assert.equal(r.execution?.complete,true,'EXECUTION_INCOMPLETE');assert.deepEqual(r.execution.infrastructureErrors,[],'INFRASTRUCTURE');
    assert.deepEqual(r.execution.semanticTests,semanticNames.map(name=>({name,status:'PASS'})),'SEMANTIC_VECTOR');
    assert.equal(r.observations?.length,84,'OBSERVATION_CARDINALITY');
    assert.deepEqual(r.observations.map(o=>tuple(o.route,o.viewport)).sort(),expected,'OBSERVATION_BIJECTION');
    for(const o of r.observations){
      assert.equal(o.conclusion,'CONCLUSIVE');assert.equal(o.overflow,false,'OVERFLOW');
      assert.ok(Number.isFinite(o.clientWidth)&&o.clientWidth>0&&o.clientWidth<=transition.f201.matrix.viewports[o.viewport][0]);assert.ok(Number.isFinite(o.scrollWidth)&&o.scrollWidth<=o.clientWidth,'SCROLL_WIDTH');
      assert.ok(o.header===null||Number.isFinite(o.header?.left)&&Number.isFinite(o.header?.right)&&o.header.left>=-.5&&o.header.right<=o.clientWidth+.5,'HEADER_BOUNDS');
      assert.ok(Array.isArray(o.smallTargets),'TARGETS_MISSING');if(o.clientWidth<=768)assert.deepEqual(o.smallTargets,[],'TARGETS');
    }
    assert.equal(r.menuResults?.length,41,'MENU_CARDINALITY');
    assert.deepEqual(r.menuResults.map(x=>x.evidenceId).sort(),matrix.entries.map(x=>x.evidenceId).sort(),'MENU_BIJECTION');
    for(const m of r.menuResults){
      const expected=matrix.entries.find(x=>x.evidenceId===m.evidenceId);assert.ok(expected);assert.equal(m.route,expected.route);assert.equal(m.viewport,expected.viewport);
      assert.equal(m.focusReached,true);assert.equal(m.focusStyle?.visible,true);assert.ok(['solid','dashed','dotted','double','groove','ridge','inset','outset','auto'].includes(m.focusStyle.style)&&Number.isFinite(m.focusStyle.width)&&m.focusStyle.width>=2);
      const o=m.open,z=m.closed;assert.equal(o?.expanded,'true');
      for(const key of ['drawerInside','focusInside','bodyLocked','backgroundInert'])assert.equal(o[key],true,`MENU_${key}`);
      assert.ok(Number.isFinite(o.closeTarget?.x)&&Number.isFinite(o.closeTarget?.y)&&o.closeTarget.x>=44&&o.closeTarget.y>=44&&typeof o.closeTarget.name==='string'&&o.closeTarget.name.trim());
      assert.equal(z?.expanded,'false');for(const key of ['focusReturned','backgroundRestored','closed'])assert.equal(z[key],true);
      assert.equal(m.closeButtonClosed,true);assert.equal(m.outsideClosed,true);
    }
    const actions=matrix.entries.flatMap(e=>e.actionPhases.map(phase=>({evidenceId:e.evidenceId,route:e.route,viewport:e.viewport,phase,status:'COMPLETED'})));
    assert.equal(actions.length,184);assert.deepEqual(r.execution.actions,actions,'ACTION_BIJECTION');
    assert.equal(r.reducedMotion?.matches,true);assert.ok(Array.isArray(r.reducedMotion.durationsMs)&&r.reducedMotion.durationsMs.length>0&&r.reducedMotion.durationsMs.every(x=>Number.isFinite(x)&&x>=0&&x<=1),'REDUCED_MOTION');
  }
  return {status:'TECHNICAL_MEASUREMENT_COMPLETE_NOT_READY',approval:false,baselineCreated:false,candidate:c.candidate,counts:{engines:3,observationsPerEngine:84,menusPerEngine:41,actionsPerEngine:184},reports:reports.map(r=>({engine:r.browser.engine,sha256:hash(JSON.stringify(r))}))};
}
export function materialize(repo,destination){
  verifyCandidate(repo,{base:c.base,head:c.candidate});assert.ok(!fs.existsSync(destination),'FRESH_MATERIALIZATION');
  const entries=[...c.payload.map(e=>({...e,source:c.candidate})),...c.authorities.filter(e=>e.file!=='deploy/publish-manifest.json')];
  // Validate all objects before creating any file. Fixed ASCII paths only.
  const files=entries.map(e=>({e,bytes:blob(repo,e.source,e)}));
  fs.mkdirSync(destination);const root=path.resolve(destination)+path.sep;
  for(const {e,bytes} of files){assert.match(e.file,/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/);assert.ok(!e.file.split('/').some(x=>x==='.'||x==='..'));
    const target=path.resolve(destination,e.file);assert.ok(target.startsWith(root),'MATERIALIZATION_ESCAPE');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});assert.equal(hash(fs.readFileSync(target)),e.sha256);
  }
  return {candidate:c.candidate,testSource:c.testSource,testBlob:c.authorities[0].blob,files:files.length};
}
// Called only in the future separately approved image. No downloads, Docker control,
// network connection, GitHub env, credential or authority injection in this entry point.
export function containerEntry(){
  assert.equal(process.platform,'linux','LINUX_RUNTIME_REQUIRED');assert.equal(process.arch,'x64');
  assert.deepEqual(Object.keys(os.networkInterfaces()).filter(n=>n!=='lo'),[],'NETWORK_NAMESPACE_REQUIRED');
  assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH,'/ms-playwright');
  assert.ok(!fs.existsSync('/outputs/measurement'),'FRESH_OUTPUT');
  const repo='/repository',source='/tmp/website27-candidate',schedule=plan(repo,{candidate:c.candidate,engines:c.engines,image:c.image,limits:c.limits});
  inspectRuntime(repo,'/deps');const provenance=materialize(repo,source);copyExistingRuntime(repo,'/deps',source);
  fs.mkdirSync('/outputs/measurement');const reports=[],processes=[];
  for(const t of schedule.tasks){
    const report=`/outputs/measurement/${t.report}`;
    const p=spawnSync(process.execPath,[path.join(here,'browser.mjs')],{cwd:source,encoding:'utf8',timeout:t.timeout,maxBuffer:32*1024*1024,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',TMPDIR:'/tmp',LANG:'C.UTF-8',PLAYWRIGHT_BROWSERS_PATH:'/ms-playwright',PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',F2_01_BROWSER:t.engine,F2_01_REPORT_PATH:report},windowsHide:true});
    fs.writeFileSync(report+'.log',(p.stdout||'')+(p.stderr||''),{flag:'wx'});processes.push({engine:t.engine,status:p.status,error:p.error?.code??null,signal:p.signal??null});
    fs.writeFileSync('/outputs/measurement/processes.json',JSON.stringify({provenance,processes},null,2)+'\n');
    assert.equal(p.status,0,'CHILD_NONZERO');assert.equal(p.error,undefined,'CHILD_ERROR');assert.equal(p.signal,null,'CHILD_SIGNAL');
    const isolation=JSON.parse(fs.readFileSync(report+'.isolation.json'));assert.deepEqual(isolation,{engine:t.engine,attempts:[],violations:[],boundary:'NETWORK_NONE_REQUIRED'},'ISOLATION_FAILED');
    reports.push(JSON.parse(fs.readFileSync(report)));
  }
  const result=validateReports(repo,reports);fs.writeFileSync('/outputs/measurement/result.json',JSON.stringify({...result,provenance},null,2)+'\n',{flag:'wx'});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{assert.equal(process.argv[2],'container','CONTAINER_COMMAND_REQUIRED');console.log(JSON.stringify(containerEntry()));}
  catch(e){console.error(`MEASUREMENT_REJECTED: ${e.message}`);process.exitCode=1;}
}
