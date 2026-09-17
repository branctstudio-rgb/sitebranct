// New, separate authorization domain. No dispatch, deployment or PR mutation.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {contract,verifyCandidate,blob,git,hash} from '../website-candidate-27/admission.mjs';
import {inspectRuntime} from '../website-candidate-27/runtime.mjs';
import {validateReports} from '../website-candidate-27/executor.mjs';
import {instrument} from './instrument.mjs';
import {validateDiagnostic,validateDiagnosticAgainstReport} from './diagnostics.mjs';
const c=contract(),here=path.dirname(fileURLToPath(import.meta.url));
export const pins=Object.freeze({repository:'branctstudio-rgb/sitebranct',branch:'agent/website-diagnostic-measurement-29',parent:'45e6f084d033f6cbe8c9cf466ebb4236d03dc85b',sourceBranch:'measurement/website26-2fbce7c',workflow:'website-diagnostic-measurement-29.yml',base:c.base,candidate:c.candidate,testSource:c.testSource,image:c.image});
const check=(v,code)=>assert.ok(v,code),ok=p=>p?.status===0&&!p.error&&!p.signal;
export function authorize(e){
 check(e.repository===pins.repository&&e.event==='push'&&e.ref===`refs/heads/${pins.branch}`&&e.workflowRef===`${pins.repository}/.github/workflows/${pins.workflow}@${e.ref}`,'EVENT_IDENTITY');
 check(e.attempt==='1'&&/^\d+$/.test(e.runId??'')&&/^[0-9a-f]{40}$/.test(e.sha??''),'ATTEMPT_IDENTITY');
 const p=e.payload;check(p?.created===true&&p.deleted===false&&p.forced===false&&p.before==='0'.repeat(40)&&p.after===e.sha&&p.ref===e.ref,'FIRST_PUSH_ONLY');
}
export function commands(root,uid,gid){
 assert.match(root,/^\/var\/tmp\/website29-[0-9]+$/);check(Number.isInteger(uid)&&uid>0&&Number.isInteger(gid)&&gid>0,'NONROOT_USER');
 const own=root.split('-').at(-1),common=['run','--pull=never','--platform=linux/amd64','--init','--user',`${uid}:${gid}`,'--cap-drop=ALL','--security-opt=no-new-privileges','--read-only','--label',`website29.run=${own}`];
 return {prepare:{command:'docker',timeout:900000,args:[...common,'--name',`website29-${own}-prepare`,'--memory=2g','--cpus=2','--pids-limit=256','--tmpfs','/tmp:rw,nosuid,nodev,size=512m','--mount',`type=bind,src=${root}/deps,dst=/deps`,'--workdir','/deps','--env','HOME=/tmp','--env','npm_config_cache=/tmp/npm','--env','PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1',c.image,'npm','ci','--ignore-scripts','--no-audit','--no-fund']},
 measure:{command:'docker',timeout:2760000,args:[...common,'--name',`website29-${own}-measure`,'--network=none','--memory=4g','--cpus=2','--pids-limit=512','--shm-size=1g','--tmpfs','/tmp:rw,nosuid,nodev,size=1g','--mount',`type=bind,src=${root}/objects,dst=/repository,readonly`,'--mount',`type=bind,src=${root}/control,dst=/control,readonly`,'--mount',`type=bind,src=${root}/deps,dst=/deps,readonly`,'--mount',`type=bind,src=${root}/outputs,dst=/outputs`,'--env','HOME=/tmp','--env','PLAYWRIGHT_BROWSERS_PATH=/ms-playwright',c.image,'node','/control/website-measurement-29/executor.mjs','container']}};
}
export function validateImage(list){assert.equal(list.length,1,'IMAGE_CARDINALITY');const i=list[0];assert.equal(i.Os,'linux');assert.equal(i.Architecture,'amd64');check(i.RepoDigests?.includes(c.image),'IMAGE_DIGEST');}
export function validateProcesses(p){assert.deepEqual(p?.processes,c.engines.map(engine=>({engine,status:0,error:null,signal:null})),'PROCESS_SET');}
export function safeBytes(file,limit=8*1024*1024){const s=fs.lstatSync(file);check(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.size<=limit,'ARTIFACT_TYPE_SIZE');const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));try{const f=fs.fstatSync(fd);check(f.ino===s.ino&&f.dev===s.dev&&f.size===s.size,'ARTIFACT_CHANGED');return fs.readFileSync(fd);}finally{fs.closeSync(fd);}}
export function safeJson(file,limit){return JSON.parse(safeBytes(file,limit));}
export function projectDiagnostic(r,engine){
 const count=(x,max)=>Array.isArray(x)&&x.length<=max?x.length:null;
 const actions=Array.isArray(r?.execution?.actions)?r.execution.actions:[];
 return {engine,complete:r?.execution?.complete===true,observationCount:count(r?.observations,84),menuCount:count(r?.menuResults,41),actionCount:count(r?.execution?.actions,184),infrastructureCount:count(r?.execution?.infrastructureErrors,184),actionStatuses:actions.slice(0,184).map(a=>['COMPLETED','TIMEOUT','ERROR'].includes(a?.status)?a.status:'UNKNOWN'),semanticStatuses:Array.isArray(r?.execution?.semanticTests)?r.execution.semanticTests.slice(0,4).map(s=>['PASS','FAIL'].includes(s?.status)?s.status:'UNKNOWN'):null};
}
export function collectEvidence(data,receipt){
 const results=[],hashes=[];
 for(const engine of c.engines){
  const f=path.join(data,`responsive-${engine}.json`);let summary=projectDiagnostic(null,engine);
  const row={...summary,report:'MISSING',diagnostic:'MISSING',trace:null};
  if(fs.existsSync(f))try{const b=safeBytes(f);hashes.push({engine,kind:'REPORT',bytes:b.length,sha256:hash(b)});Object.assign(row,projectDiagnostic(JSON.parse(b),engine),{report:'PRESENT'});}catch{row.report='INVALID';receipt.exitCode=1;receipt.code='INCONCLUSIVE';}
  if(fs.existsSync(f+'.diagnostic.json'))try{const b=safeBytes(f+'.diagnostic.json',256*1024);row.trace=validateDiagnostic(JSON.parse(b),engine);row.diagnostic='PRESENT';hashes.push({engine,kind:'DIAGNOSTIC',bytes:b.length,sha256:hash(b)});}catch{row.diagnostic='INVALID';row.trace=null;receipt.exitCode=1;receipt.code='INCONCLUSIVE';}
  if(row.report!=='PRESENT'||row.diagnostic!=='PRESENT'){receipt.exitCode=1;if(receipt.code==='MEASURED_NOT_RELEASED')receipt.code='INCONCLUSIVE';}
  results.push(row);
 }
 return {results,hashes};
}
export async function runOnce(event,io){
 const r={code:'INCONCLUSIVE',exitCode:1,stages:[],cleanup:'NOT_STARTED'};let owned=false;
 try{authorize(event);await io.preflight();io.reserve();owned=true;
  for(const stage of ['prepare','measure']){const p=await io[stage]();r.stages.push({stage,status:p?.status??null,error:!!p?.error,signal:!!p?.signal});check(ok(p),`${stage.toUpperCase()}_FAILED`);}
  io.stopOwned();r.cleanup='STOPPED_OR_EXITED';r.proof=io.verify();check(r.proof.status==='TECHNICAL_MEASUREMENT_COMPLETE_NOT_READY','PROOF_MISSING');r.code='MEASURED_NOT_RELEASED';r.exitCode=0;
 }catch(e){r.code=['PREPARE_FAILED','MEASURE_FAILED','PROOF_MISSING'].includes(e.message)?e.message:'INCONCLUSIVE';}
 finally{if(owned&&r.cleanup==='NOT_STARTED')try{io.stopOwned();r.cleanup='STOPPED_OR_EXITED';}catch{r.cleanup='FAILED';r.code='CLEANUP_FAILED';r.exitCode=1;}
  try{io.collect(r);}catch{r.code='ARTIFACT_FAILED';r.exitCode=1;}}
 return r;
}
export function recover(io,{ownedExists,metadataExists,priorCode='UNKNOWN'}){
 const codes=['INCONCLUSIVE','PREPARE_FAILED','MEASURE_FAILED','PROOF_MISSING','MEASURED_NOT_RELEASED','CLEANUP_FAILED','ARTIFACT_FAILED','INTERRUPTED_NO_PROOF'];
 const r={code:'INTERRUPTED_NO_PROOF',exitCode:1,cleanup:'NOT_STARTED',priorCode:codes.includes(priorCode)?priorCode:'UNKNOWN'};let failed=false;
 try{if(ownedExists)io.stopOwned();r.cleanup='STOPPED_OR_ABSENT';}
 catch{failed=true;r.code='CLEANUP_FAILED';r.cleanup='FAILED';}
 finally{if(!metadataExists||failed)try{io.collect(r);}catch{r.code='ARTIFACT_FAILED';r.exitCode=1;}}
 // Existing successful/failed primary evidence is left untouched after normal cleanup.
 // Cleanup failure always exports what remains, but never reports success.
 if(metadataExists&&!failed)r.exitCode=0;
 return r;
}
export function verifyEvidence(repo,root){
 const expected=['processes.json','result.json',...c.engines.flatMap(e=>[`responsive-${e}.json`,`responsive-${e}.json.log`,`responsive-${e}.json.isolation.json`,`responsive-${e}.json.diagnostic.json`])].sort();
 assert.deepEqual(fs.readdirSync(root).sort(),expected,'CLOSED_OUTPUT_FILES');
 const p=safeJson(path.join(root,'processes.json'));validateProcesses(p);
 const runtime=p.provenance?.runtime;check(runtime?.packageTreeDigest===c.runtimePackages.canonicalTreeDigest&&runtime.version==='1.62.0','PROVENANCE_RUNTIME');
 check(p.provenance.candidate===c.candidate&&p.provenance.testSource===c.testSource&&p.provenance.testBlob===c.authorities[0].blob&&p.provenance.files===64,'PROVENANCE_SOURCE');
 const source=blob(repo,c.testSource,c.authorities[0]),patch=instrument(source);
 assert.deepEqual(p.provenance.instrumentation,{schemaVersion:1,sourceSha256:patch.sourceSha256,executedSha256:patch.executedSha256},'INSTRUMENTATION_PROVENANCE');
 const reports=c.engines.map(engine=>{const n=`responsive-${engine}.json`;assert.deepEqual(safeJson(path.join(root,n+'.isolation.json')),{engine,attempts:[],violations:[],boundary:'NETWORK_NONE_REQUIRED'},'ISOLATION');safeBytes(path.join(root,n+'.log'));const report=safeJson(path.join(root,n));validateDiagnosticAgainstReport(safeJson(path.join(root,n+'.diagnostic.json'),256*1024),report,engine);return report;});
 const proof=validateReports(repo,reports),result=safeJson(path.join(root,'result.json'));assert.deepEqual(result,{...proof,provenance:p.provenance},'RESULT_RECOMPUTED');return proof;
}
function nativeIO(e){
 const root=`/var/tmp/website29-${e.runId}`,workspace=e.workspace,control=path.join(workspace,'control'),candidate=path.join(workspace,'application'),testSource=path.join(workspace,'test-source');
 const cleanEnv={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:e.temp,TMPDIR:e.temp,LANG:'C.UTF-8',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'};
 const exec=(command,args,timeout=30000)=>spawnSync(command,args,{env:cleanEnv,encoding:'utf8',timeout,maxBuffer:32*1024*1024});
 const text=(cmd,args,timeout)=>{const p=exec(cmd,args,timeout);check(ok(p),'HOST_COMMAND_FAILED');return p.stdout.trim();};
 const schedule=commands(root,process.getuid(),process.getgid());
 const reserveReceipt=()=>safeJson(path.join(root,'owner.json'));
 const io={
  async preflight(){
   check(process.platform==='linux'&&process.arch==='x64','LINUX_X64');check(fs.readFileSync('/etc/os-release','utf8').includes('VERSION_ID="24.04"'),'UBUNTU_2404');
   check(os.cpus().length>=2&&os.freemem()>=5*1024**3,'MEMORY_CPU');const space=fs.statfsSync('/var/tmp');check(space.bavail*space.bsize>=12*1024**3,'DISK');check(!fs.existsSync(root),'FRESH_ATTEMPT');
   for(const [repo,sha]of [[control,e.sha],[candidate,c.candidate],[testSource,c.testSource]]){assert.equal(text('git',['-C',repo,'rev-parse','HEAD']),sha);assert.equal(text('git',['-C',repo,'status','--porcelain']),'');}
   check(ok(exec('git',['-C',control,'merge-base','--is-ancestor',pins.parent,e.sha])),'PARENT_CHAIN');
   const d=JSON.parse(text('docker',['info','--format','{{json .}}']));check(d.OSType==='linux'&&d.CgroupVersion==='2'&&d.NCPU>=2&&d.MemTotal>=5*1024**3,'DOCKER_HOST');
   for(const suffix of ['prepare','measure'])assert.equal(text('docker',['ps','-aq','--filter',`name=^/website29-${e.runId}-${suffix}$`]),'','CONTAINER_ABSENT');
   // Public metadata only. No credentials or fallback on rate-limit/incomplete history.
   const get=async url=>{const r=await fetch(url,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});check(r.status===200&&!r.headers.get('link')?.includes('rel="next"'),'METADATA_READ');return r.json();};
   const base=await get(`https://api.github.com/repos/${pins.repository}/git/ref/heads/main`);assert.equal(base.object.sha,c.base,'MAIN_DRIFT');
   const h=await get(`https://api.github.com/repos/${pins.repository}/actions/workflows/${pins.workflow}/runs?event=push&branch=${encodeURIComponent(pins.branch)}&per_page=100`);
   check(h.total_count===1&&h.workflow_runs?.length===1&&String(h.workflow_runs[0].id)===e.runId&&h.workflow_runs[0].head_sha===e.sha&&h.workflow_runs[0].run_attempt===1,'SINGLE_HISTORY');
  },
  reserve(){fs.mkdirSync(root,{mode:0o700});fs.writeFileSync(path.join(root,'owner.json'),JSON.stringify({runId:e.runId,sha:e.sha,started:new Date().toISOString()}),{flag:'wx',mode:0o600});},
  prepare(){
   for(const name of ['objects','control','deps','outputs'])fs.mkdirSync(path.join(root,name));
   text('git',['-c','init.templateDir=','init','--bare',path.join(root,'objects')]);
   for(const [repo,sha,ref]of [[candidate,c.candidate,'candidate'],[testSource,c.testSource,'test'],[control,e.sha,'control']])text('git',['-C',path.join(root,'objects'),'-c','core.hooksPath=/dev/null','fetch','--no-tags',repo,`${sha}:refs/heads/${ref}`],300000);
   verifyCandidate(path.join(root,'objects'),{base:c.base,head:c.candidate});
   // Materialize historical27 and exact authorized29 directly from Git; no checkout config.
   for(const dir of ['website-candidate-27','website-measurement-29'])fs.mkdirSync(path.join(root,'control',dir));
   for(const name of ['admission.mjs','contract.json','runtime.mjs','executor.mjs','browser.mjs'])fs.writeFileSync(path.join(root,'control/website-candidate-27',name),git(control,'show',`62104c9c2d41aff296643aa4af8e067433a1673f:scripts/governance/website-candidate-27/${name}`),{flag:'wx'});
   for(const name of ['executor.mjs','browser.mjs','instrument.mjs','diagnostics.mjs'])fs.writeFileSync(path.join(root,'control/website-measurement-29',name),git(control,'show',`${e.sha}:scripts/governance/website-measurement-29/${name}`),{flag:'wx'});
   for(const file of ['package.json','package-lock.json']){const a=c.authorities.find(x=>x.file===file);fs.writeFileSync(path.join(root,'deps',file),blob(path.join(root,'objects'),a.source,a),{flag:'wx'});}
   const pull=exec('docker',['pull','--platform=linux/amd64',c.image],600000);if(!ok(pull))return pull;
   validateImage(JSON.parse(text('docker',['image','inspect',c.image])));
   const p=exec(schedule.prepare.command,schedule.prepare.args,schedule.prepare.timeout);if(ok(p))inspectRuntime(path.join(root,'objects'),path.join(root,'deps'));return p;
  },
  measure(){validateImage(JSON.parse(text('docker',['image','inspect',c.image])));return exec(schedule.measure.command,schedule.measure.args,schedule.measure.timeout);},
  stopOwned(){
   const own=reserveReceipt();check(own.runId===e.runId&&own.sha===e.sha,'OWNERSHIP');
   for(const suffix of ['prepare','measure']){const name=`website29-${e.runId}-${suffix}`,id=text('docker',['ps','-aq','--filter',`name=^/${name}$`]);if(!id)continue;assert.match(id,/^[0-9a-f]{12,64}$/);const list=JSON.parse(text('docker',['inspect',id]));assert.equal(list.length,1);const d=list[0];check(d.Name===`/${name}`&&d.Config.Image===c.image&&d.Config.Labels?.['website29.run']===e.runId&&Date.parse(d.Created)>=Date.parse(own.started),'OWNERSHIP');
    check(d.Mounts?.some(m=>m.Source===root+'/deps'),'OWNED_MOUNT');if(d.State.Running)text('docker',['stop','--time','10',id],30000);check(!JSON.parse(text('docker',['inspect',id]))[0].State.Running,'STILL_RUNNING');}
  },
  verify(){return verifyEvidence(path.join(root,'objects'),path.join(root,'outputs/measurement'));},
  collect(r){
   const dir=path.join(workspace,'website29-artifacts');if(!fs.existsSync(dir))fs.mkdirSync(dir);
   const data=path.join(root,'outputs/measurement');
   if(fs.existsSync(data))check(fs.lstatSync(data).isDirectory()&&!fs.lstatSync(data).isSymbolicLink(),'ARTIFACT_DIR');
   const {results,hashes}=collectEvidence(data,r);
   const metadata={schemaVersion:1,wrapper:e.sha,runId:e.runId,candidate:c.candidate,base:c.base,testSource:c.testSource,complement:pins.parent,image:c.image,...r};
   for(const [name,value]of Object.entries({'metadata.json':metadata,'results.json':results,'hashes.json':hashes}))fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n');
  },
 };
 return io;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const e=process.env;try{check(process.platform==='linux','LINUX_REQUIRED');const event={event:e.GITHUB_EVENT_NAME,repository:e.GITHUB_REPOSITORY,ref:e.GITHUB_REF,sha:e.GITHUB_SHA,attempt:e.GITHUB_RUN_ATTEMPT,runId:e.GITHUB_RUN_ID,workflowRef:e.GITHUB_WORKFLOW_REF,payload:safeJson(e.GITHUB_EVENT_PATH),workspace:e.GITHUB_WORKSPACE,temp:e.RUNNER_TEMP};authorize(event);assert.ok(path.isAbsolute(event.workspace)&&path.isAbsolute(event.temp));
  const io=nativeIO(event);
  if(process.argv[2]==='recover'){const root=`/var/tmp/website29-${event.runId}`,meta=path.join(event.workspace,'website29-artifacts/metadata.json');let priorCode='UNKNOWN';if(fs.existsSync(meta))try{priorCode=safeJson(meta).code;}catch{}process.exitCode=recover(io,{ownedExists:fs.existsSync(root),metadataExists:fs.existsSync(meta),priorCode}).exitCode;}
  else {assert.equal(process.argv.length,2,'NO_PARAMETERS');const r=await runOnce(event,io);console.log(r.code);process.exitCode=r.exitCode;}
 }catch{console.error('MEASUREMENT_29_REJECTED');process.exitCode=1;}
}
