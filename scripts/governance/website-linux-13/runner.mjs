// Proposed trusted host wrapper. Never execute candidate code on the host.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const pins=JSON.parse(fs.readFileSync(path.join(here,'source-package.json'),'utf8'));
const workflow='website-linux-diagnostic-13.yml',root='/var/tmp/branct-website-linux-11';
const hash=b=>createHash('sha256').update(b).digest('hex');
const requireThat=(ok,code)=>{if(!ok)throw new Error(code);};
const success=p=>p&&p.status===0&&!p.error&&!p.signal;
const codes=new Set(['AUTHORIZATION_INVALID','SOURCE_INVALID','PACKAGE_INVALID','HOST_INVALID','RESOURCES_INSUFFICIENT','DOCKER_INVALID','ATTEMPT_NOT_FRESH','HISTORY_INVALID','PREPARE_FAILED','MEASURE_FAILED','PREFLIGHT_FAILED','INPUT_FAILED','CLEANUP_FAILED','COLLECTION_FAILED']);
export function authorize(c){
 requireThat(c.event==='workflow_dispatch'&&c.repository===pins.repository&&c.ref==='refs/heads/main'&&c.workflowRef===`${pins.repository}/.github/workflows/${workflow}@refs/heads/main`&&c.attempt==='1'&&/^\d+$/.test(c.runId||'')&&/^[0-9a-f]{40}$/.test(c.sha||'')&&c.wrapperSha===c.sha&&/^WEBSITE-LINUX-13-\d{8}-\d{2}$/.test(c.authorizationId||''),'AUTHORIZATION_INVALID');
 requireThat(c.authorization===`AUTHORIZE ${c.authorizationId} ${c.sha} ${pins.sourceHead} ${pins.packageDigest}`,'AUTHORIZATION_INVALID');
}
export async function runOnce(c,io){
 const report={code:'PREFLIGHT_FAILED',exitCode:1,stages:[]};let reserved=false;
 try{
  authorize(c);
  const f=io.inspect();
  requireThat(f.sourceHead===pins.sourceHead&&f.sourceTree===pins.sourceTree&&f.sourceClean===true&&f.fullHistory===true&&f.sourceFilesValid===true&&f.wrapperHead===c.sha&&f.wrapperClean===true,'SOURCE_INVALID');
  requireThat(f.packageDigest===pins.packageDigest,'PACKAGE_INVALID');
  requireThat(f.platform==='linux'&&f.arch==='x64'&&f.ubuntu==='24.04','HOST_INVALID');
  requireThat([f.cpu,f.availableMemory,f.freeBytes].every(Number.isFinite)&&f.cpu>=2&&f.availableMemory>=6*1024**3&&f.freeBytes>=10*1024**3,'RESOURCES_INSUFFICIENT');
  requireThat(f.docker&&f.docker.OSType==='linux'&&['x86_64','amd64'].includes(f.docker.Architecture)&&f.docker.NCPU>=2&&f.docker.MemTotal>=6*1024**3&&f.docker.CgroupVersion==='2','DOCKER_INVALID');
  requireThat(f.rootAbsent===true&&f.containersAbsent===true,'ATTEMPT_NOT_FRESH');
  const h=await io.history();
  requireThat(Number.isSafeInteger(h?.total_count)&&Array.isArray(h.workflow_runs)&&h.total_count===h.workflow_runs.length&&h.total_count<=100,'HISTORY_INVALID');
  const same=h.workflow_runs.filter(r=>r.display_title===c.authorizationId);
  requireThat(same.length===1&&String(same[0].id)===c.runId&&same[0].head_sha===c.sha&&same[0].event==='workflow_dispatch'&&same[0].run_attempt===1,'HISTORY_INVALID');
  report.resources={cpu:f.cpu,availableMemory:f.availableMemory,freeBytes:f.freeBytes};
  io.reserve();reserved=true;io.prepareInput();
  for(const stage of ['prepare','measure']){
   const p=io.stage(stage);report.stages.push({stage,status:Number.isInteger(p?.status)?p.status:null,error:!!p?.error,signal:!!p?.signal});
   requireThat(success(p),`${stage.toUpperCase()}_FAILED`);
  }
  report.code='MEASUREMENT_EXIT_ZERO_NOT_ACCEPTANCE';report.exitCode=0;
 }catch(e){report.code=codes.has(e.message)?e.message:'PREFLIGHT_FAILED';report.exitCode=1;}
 finally{
  if(reserved)try{io.stopOwned();}catch{report.code='CLEANUP_FAILED';report.exitCode=1;}
  try{io.collect(report);}catch{report.code='COLLECTION_FAILED';report.exitCode=1;}
 }
 return report;
}
// Local regular files only; never follow links into arbitrary workspace/environment files.
export function regularBytes(file,limit=32*1024*1024){
 const stat=fs.lstatSync(file);requireThat(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.size<=limit,'PACKAGE_INVALID');
 const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{const actual=fs.fstatSync(fd);requireThat(actual.ino===stat.ino&&actual.dev===stat.dev&&actual.size===stat.size,'PACKAGE_INVALID');return fs.readFileSync(fd);}finally{fs.closeSync(fd);}
}
export function inspectPackage(directory){
 const list=pins.packageFiles.map(f=>{const bytes=regularBytes(path.join(directory,f.file));requireThat(bytes.length===f.bytes&&hash(bytes)===f.sha256,'PACKAGE_INVALID');return {file:f.file,sha256:hash(bytes)};});
 return hash(Buffer.from(JSON.stringify(list)));
}
// Deliberately loss-limited projection: arbitrary browser messages, HTML, URLs, form data and raw logs are NOT uploaded.
function projectCausal(name,obj){
 const engine=name==='causal-chromium.json'?'chromium':'webkit';
 const valid=ok=>requireThat(ok,'COLLECTION_FAILED');
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 valid(obj?.playwright==='1.62.0'&&Array.isArray(obj.records)&&obj.records.length===2);
 const records=obj.records.map(r=>{
  valid(r?.engine===engine&&typeof r.version==='string'&&/^\d{1,4}(?:\.\d{1,6}){1,3}$/.test(r.version)&&r.options?.headless===true&&['PASS','INCONCLUSIVE'].includes(r.result));
  const common={engine,version:r.version,context:r.context,result:r.result,deadline:r.deadline,errorPresent:r.error!=null};
  if(engine==='chromium'){
   valid(r.context==='newPage'&&r.deadline===2500&&Array.isArray(r.options.args)&&Array.isArray(r.samples));
   const args=r.options.args;
   valid(args.length===0||(args.length===1&&args[0]==='--run-all-compositor-stages-before-draw'));
   for(const s of r.samples)valid(s&&finite(s.hostElapsed)&&s.hostElapsed>=0&&Array.isArray(s.rect)&&s.rect.length===4&&s.rect.every(finite)&&typeof s.active==='boolean'&&typeof s.focus==='boolean');
   const last=r.samples.at(-1);
   return {...common,variant:args.length?'COMPOSITOR':'STANDARD',sampleCount:r.samples.length,lastHostElapsed:last?.hostElapsed??null,lastRect:last?.rect??null,lastAnimationActive:last?.active??null,lastFocus:last?.focus??null};
  }
  const m=r.media;
  valid(['newPage','newContext.newPage'].includes(r.context)&&r.deadline===30000&&typeof r.loadCompleted==='boolean');
  valid(m&&Number.isInteger(m.readyState)&&m.readyState>=0&&m.readyState<=4&&Number.isInteger(m.networkState)&&m.networkState>=0&&m.networkState<=3&&(m.error===null||(Number.isInteger(m.error)&&m.error>=1&&m.error<=4))&&(m.duration===null||(finite(m.duration)&&m.duration>=0))&&['loading','interactive','complete'].includes(m.documentReady));
  return {...common,variant:r.context==='newPage'?'IMPLICIT_CONTEXT':'EXPLICIT_CONTEXT',loadCompleted:r.loadCompleted,media:{readyState:m.readyState,networkState:m.networkState,error:m.error,duration:m.duration,documentReady:m.documentReady}};
 });
 valid(new Set(records.map(r=>r.variant)).size===2);
 return {recordCount:2,records}; // diagnostic values, never a new acceptance decision
}
export function projectJson(name,raw){
 const obj=JSON.parse(raw);const count=a=>Array.isArray(a)?a.length:null;
 if(name==='causal-chromium.json'||name==='causal-webkit.json')return projectCausal(name,obj);
 if(name==='summary.json')return {head:obj.head===pins.sourceHead?pins.sourceHead:null,results:Array.isArray(obj.results)?obj.results.map(r=>({name:['lexical','webkit-webm','causal-chromium','causal-webkit','responsive-chromium','responsive-firefox','responsive-webkit'].includes(r.name)?r.name:'UNRECOGNIZED',status:Number.isInteger(r.status)?r.status:null,errorPresent:r.error!=null,signalPresent:r.signal!=null})):null};
 return {complete:obj.execution?.complete===true,observations:count(obj.observations),menus:count(obj.menuResults),actions:count(obj.execution?.actions),infrastructureErrors:count(obj.execution?.infrastructureErrors),semanticStatuses:Array.isArray(obj.execution?.semanticTests)?obj.execution.semanticTests.map(t=>['PASS','FAIL'].includes(t.status)?t.status:'UNKNOWN'):null,externalAttempts:count(obj.attempts),violations:count(obj.violations),recordCount:count(obj.records)};
}
function nativeIO(c){
 const control=path.resolve(here,'../../..'),application=path.join(c.workspace,'application');
 const env={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:c.temp,TMPDIR:c.temp,LANG:'C.UTF-8',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'};
 const execute=(cmd,args,timeout=30000)=>spawnSync(cmd,args,{env,encoding:'utf8',timeout,maxBuffer:32*1024*1024,windowsHide:true});
 const text=(cmd,args)=>{const p=execute(cmd,args);requireThat(success(p),'PREFLIGHT_FAILED');return p.stdout.trim();};
 let receipt;
 const readReceipt=()=>{
  if(!fs.existsSync(root))return null;
  const st=fs.lstatSync(root);requireThat(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===process.getuid(),'ATTEMPT_NOT_FRESH');
  const r=JSON.parse(regularBytes(path.join(root,'receipt.json'),10000));
  requireThat(r.runId===c.runId&&r.sha===c.sha&&r.authorizationId===c.authorizationId,'ATTEMPT_NOT_FRESH');return r;
 };
 const freeBytes=()=>{const s=fs.statfsSync('/var/tmp');return s.bavail*s.bsize;};
 return {
  inspect(){
   const docker=execute('docker',['info','--format','{{json .}}']);
   const filesValid=pins.sourceFiles.every(f=>{
    const tuple=text('git',['-C',application,'ls-tree',pins.sourceHead,'--',f.file]);
    return tuple===`${f.mode} blob ${f.blob}\t${f.file}`&&hash(regularBytes(path.join(application,f.file)))===f.sha256;
   });
   const mem=/^MemAvailable:\s+(\d+) kB$/m.exec(fs.readFileSync('/proc/meminfo','utf8'));
   const release=fs.readFileSync('/etc/os-release','utf8');
   return {sourceHead:text('git',['-C',application,'rev-parse','HEAD']),sourceTree:text('git',['-C',application,'rev-parse','HEAD^{tree}']),sourceClean:text('git',['-C',application,'status','--porcelain'])==='',fullHistory:text('git',['-C',application,'rev-parse','--is-shallow-repository'])==='false',sourceFilesValid:filesValid,wrapperHead:text('git',['-C',control,'rev-parse','HEAD']),wrapperClean:text('git',['-C',control,'status','--porcelain'])==='',packageDigest:inspectPackage(path.join(here,'package12')),platform:process.platform,arch:process.arch,ubuntu:/^ID=ubuntu$/m.test(release)?/^VERSION_ID="([^"]+)"$/m.exec(release)?.[1]:null,cpu:os.availableParallelism(),availableMemory:mem?Number(mem[1])*1024:0,freeBytes:freeBytes(),docker:success(docker)?JSON.parse(docker.stdout):null,rootAbsent:!fs.existsSync(root),containersAbsent:text('docker',['ps','-aq','--filter','name=^/website-11-(npm|measure)$'])===''};
  },
  async history(){
   // Public metadata only; no token supplied. Incomplete history/rate-limit/error stops, no retry.
   const r=await fetch(`https://api.github.com/repos/${pins.repository}/actions/workflows/${workflow}/runs?event=workflow_dispatch&per_page=100`,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});
   requireThat(r.status===200&&!r.headers.get('link')?.includes('rel="next"'),'HISTORY_INVALID');return await r.json();
  },
  reserve(){fs.mkdirSync(root,{mode:0o700});receipt={runId:c.runId,sha:c.sha,authorizationId:c.authorizationId,started:new Date().toISOString(),stage:'RESERVED'};fs.writeFileSync(path.join(root,'receipt.json'),JSON.stringify(receipt),{flag:'wx',mode:0o600});},
  prepareInput(){
   requireThat(readReceipt()?.stage==='RESERVED','ATTEMPT_NOT_FRESH');
   fs.mkdirSync(path.join(root,'input'));fs.mkdirSync(path.join(root,'input/package'));
   const p=execute('git',['-C',application,'bundle','create',path.join(root,'input/source.bundle'),'HEAD'],300000);requireThat(success(p),'INPUT_FAILED');
   requireThat(success(execute('git',['-C',application,'bundle','verify',path.join(root,'input/source.bundle')])),'INPUT_FAILED');
   const names=['future-linux.sh','linux-run.mjs','linux-responsive.mjs','causal-browser.mjs'];
   for(const name of names)fs.copyFileSync(path.join(here,'package12',name),path.join(root,'input/package',name),fs.constants.COPYFILE_EXCL);
   const sums=['source.bundle',...names.map(n=>`package/${n}`)].map(n=>`${hash(fs.readFileSync(path.join(root,'input',n)))}  ${n}`).join('\n')+'\n';
   fs.writeFileSync(path.join(root,'input/SHA256SUMS'),sums,{flag:'wx'});
   requireThat(freeBytes()>=10*1024**3,'RESOURCES_INSUFFICIENT');
  },
  stage(stage){
   receipt.stage=stage;fs.writeFileSync(path.join(root,'receipt.json'),JSON.stringify(receipt));
   const p=execute('bash',[path.join(root,'input/package/future-linux.sh'),'--human-authorized-linux-11',stage],stage==='prepare'?1200000:4200000);
   fs.writeFileSync(path.join(root,`${stage}.raw.log`),(p.stdout||'')+(p.stderr||''));return p;
  },
  stopOwned(){
   const own=readReceipt();if(!own)return;
   for(const name of ['website-11-npm','website-11-measure']){
    const id=text('docker',['ps','-aq','--filter',`name=^/${name}$`]);if(!id)continue;
    requireThat(/^[0-9a-f]{12,64}$/.test(id),'CLEANUP_FAILED');
    const list=JSON.parse(text('docker',['inspect',id]));requireThat(list.length===1,'CLEANUP_FAILED');const d=list[0];
    requireThat(d.Name===`/${name}`&&d.Config.Image===pins.image&&Date.parse(d.Created)>=Date.parse(own.started)&&d.Mounts.some(m=>m.Source===path.join(root,name==='website-11-npm'?'deps':'source')),'CLEANUP_FAILED');
    if(d.State.Running)requireThat(success(execute('docker',['stop','--time','10',id])),'CLEANUP_FAILED');
   }
  },
  collect(report){
   const output=path.join(c.workspace,'website-linux-13-artifacts');fs.mkdirSync(output,{recursive:true});
   const hashes=[],results=[],technical=[];
   let own=null;try{own=readReceipt();}catch{report.exitCode=1;}
   if(report.code==='CLEANUP_FAILED')own=null; // never race evidence reads against a container that could still be running
   const dir=path.join(root,'outputs/results');
   if(own){for(const stage of ['prepare','measure']){const file=path.join(root,`${stage}.raw.log`);if(fs.existsSync(file)){const bytes=regularBytes(file);hashes.push({name:`${stage}.raw.log`,bytes:bytes.length,sha256:hash(bytes)});}}}
   if(own&&fs.existsSync(dir)){
    const st=fs.lstatSync(dir);requireThat(st.isDirectory()&&!st.isSymbolicLink(),'COLLECTION_FAILED');
    const names=['summary.json','lexical.log','webkit-webm.log','causal-chromium.log','causal-webkit.log','causal-chromium.json','causal-webkit.json',...['chromium','firefox','webkit'].flatMap(e=>[`responsive-${e}.log`,`responsive-${e}.json`,`responsive-${e}.json.isolation.json`])];
    for(const name of names)if(fs.existsSync(path.join(dir,name))){
     const bytes=regularBytes(path.join(dir,name));hashes.push({name,bytes:bytes.length,sha256:hash(bytes)});
     if(name.endsWith('.json')){try{results.push({name,projection:projectJson(name,bytes)});}catch{results.push({name,parse:'INVALID'});report.exitCode=1;report.code='COLLECTION_FAILED';}}
     else technical.push(...bytes.toString('utf8').split(/\r?\n/).filter(line=>/^# (tests|pass|fail|cancelled|skipped|todo|duration_ms) \d+(?:\.\d+)?$/.test(line)).map(line=>`${name}: ${line}`));
    }
   }
   fs.writeFileSync(path.join(output,'metadata.json'),JSON.stringify({source:pins.sourceHead,packageDigest:pins.packageDigest,wrapper:/^[0-9a-f]{40}$/.test(c.sha||'')?c.sha:null,runId:/^\d+$/.test(c.runId||'')?c.runId:null,actor:/^[A-Za-z0-9-]+$/.test(c.actor||'')?c.actor:null,...report},null,2)+'\n');
   fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2)+'\n');
   fs.writeFileSync(path.join(output,'hashes.json'),JSON.stringify(hashes,null,2)+'\n');
   fs.writeFileSync(path.join(output,'technical.log'),technical.join('\n')+'\n');
  },
 };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const e=process.env,c={event:e.GITHUB_EVENT_NAME,repository:e.GITHUB_REPOSITORY,ref:e.GITHUB_REF,workflowRef:e.GITHUB_WORKFLOW_REF,sha:e.GITHUB_SHA,wrapperSha:e.AUTH_WRAPPER_SHA,runId:e.GITHUB_RUN_ID,attempt:e.GITHUB_RUN_ATTEMPT,actor:e.GITHUB_ACTOR,authorizationId:e.AUTH_ID,authorization:e.AUTH_TEXT,workspace:e.GITHUB_WORKSPACE,temp:e.RUNNER_TEMP};
 try{
  requireThat(process.platform==='linux'&&path.isAbsolute(c.workspace||'')&&path.isAbsolute(c.temp||''),'HOST_INVALID');
  const io=nativeIO(c);
  if(process.argv[2]==='--collect-only'){
   authorize(c);io.stopOwned();
   const metadata=path.join(c.workspace,'website-linux-13-artifacts/metadata.json');
   if(fs.existsSync(metadata)){
    const previous=JSON.parse(regularBytes(metadata,100000));requireThat(previous.wrapper===c.sha&&previous.runId===c.runId,'COLLECTION_FAILED');
    console.log('EXISTING_SANITIZED_EVIDENCE_PRESERVED');
   }else io.collect({code:'INCOMPLETE_NO_CAMPAIGN_REPORT',exitCode:1,stages:[]});
  }else{const r=await runOnce(c,io);console.log(r.code);process.exitCode=r.exitCode;}
 }catch{console.error('DIAGNOSTIC_REJECTED');process.exitCode=1;}
}
