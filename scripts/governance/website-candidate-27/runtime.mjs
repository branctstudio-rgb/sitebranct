// Local reproducible audit context. Copies an existing complete matching package;
// never synthesizes browsers.json, installs, downloads, alters the source or claims CI.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {contract,blob,git,hash} from './admission.mjs';
const c=contract(),engines=['chromium','firefox','webkit'];
function readRegular(file){const s=fs.lstatSync(file);assert.ok(s.isFile()&&!s.isSymbolicLink(),'REGULAR_FILE_REQUIRED');return fs.readFileSync(file);}
export function validateFacts(r){
  assert.equal(r.version,'1.62.0','RUNTIME_VERSION');assert.equal(r.coreVersion,r.version,'CORE_VERSION');assert.equal(r.lockVersion,r.version,'LOCK_VERSION');
  assert.deepEqual(r.builds,[{name:'chromium',revision:'1234',version:'151.0.7922.34'},{name:'firefox',revision:'1538',version:'153.0'},{name:'webkit',revision:'2336',version:'26.5'}],'BROWSER_BUILDS');
}
export function inspectRuntime(repo,provider){
  assert.ok(provider&&path.isAbsolute(provider),'EXPLICIT_RUNTIME_REQUIRED');
  const json=f=>JSON.parse(readRegular(path.join(provider,'node_modules',f)));
  const registry=readRegular(path.join(provider,'node_modules/playwright-core/browsers.json'));
  const lockEntry=c.authorities.find(e=>e.file==='package-lock.json');const lock=JSON.parse(blob(repo,lockEntry.source,lockEntry));
  for(const archive of c.runtimePackages.archives)assert.equal(lock.packages[`node_modules/${archive.name}`].integrity,archive.integrity,'RUNTIME_LOCK_SRI');
  const files=[];
  function inspect(file,relative){const s=fs.lstatSync(file);assert.ok(!s.isSymbolicLink(),'RUNTIME_LINK_REJECTED');
    if(s.isDirectory()){for(const name of fs.readdirSync(file))inspect(path.join(file,name),relative+'/'+name);}
    else {const bytes=readRegular(file);files.push({file:relative,bytes:bytes.length,sha256:hash(bytes)});}}
  for(const name of ['playwright','playwright-core'])inspect(path.join(provider,'node_modules',name),name);
  files.sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
  assert.equal(files.length,c.runtimePackages.fileCount,'RUNTIME_TREE_CARDINALITY');
  const packageTreeDigest=hash(JSON.stringify(files));assert.equal(packageTreeDigest,c.runtimePackages.canonicalTreeDigest,'RUNTIME_TREE_DIGEST');
  const builds=JSON.parse(registry).browsers.filter(b=>engines.includes(b.name)).map(b=>({name:b.name,revision:b.revision,version:b.browserVersion}));
  const r={version:json('playwright/package.json').version,coreVersion:json('playwright-core/package.json').version,lockVersion:lock.packages['node_modules/playwright'].version,builds,registrySha256:hash(registry),packageTreeDigest,archives:c.runtimePackages.archives,provider:path.resolve(provider),installed:false};
  validateFacts(r);return r;
}
export function copyExistingRuntime(repo,provider,destination){
  const facts=inspectRuntime(repo,provider),files=[];
  function copy(source,target,relative){
    const s=fs.lstatSync(source);assert.ok(!s.isSymbolicLink(),'RUNTIME_LINK_REJECTED');
    if(s.isDirectory()){fs.mkdirSync(target,{recursive:false});for(const name of fs.readdirSync(source).sort())copy(path.join(source,name),path.join(target,name),`${relative}/${name}`);}
    else {assert.ok(s.isFile(),'RUNTIME_TYPE_REJECTED');const b=readRegular(source);fs.writeFileSync(target,b,{flag:'wx'});assert.equal(hash(readRegular(target)),hash(b));files.push({file:relative,bytes:b.length,sha256:hash(b)});}
  }
  fs.mkdirSync(path.join(destination,'node_modules'),{recursive:true});
  for(const p of ['playwright','playwright-core']){const target=path.join(destination,'node_modules',p);assert.ok(!fs.existsSync(target),'RUNTIME_DESTINATION_EXISTS');copy(path.join(provider,'node_modules',p),target,p);}
  assert.equal(inspectRuntime(repo,destination).registrySha256,facts.registrySha256);
  return {...facts,copiedFiles:files.length};
}
export function audit(repo,authority,provider,out){
  assert.match(authority??'',/^[0-9a-f]{40}$/,'AUTHORITY_SHA_REQUIRED');
  assert.ok([c.candidate,c.technicalParent].includes(authority),'AUTHORITY_NOT_ADMITTED');
  assert.equal(git(repo,'rev-parse',`${authority}^{commit}`).toString().trim(),authority,'AUTHORITY_UNRESOLVED');
  inspectRuntime(repo,provider);assert.ok(path.isAbsolute(out)&&!fs.existsSync(out),'FRESH_OUTPUT_REQUIRED');
  fs.mkdirSync(out);const source=path.join(out,'source');
  const run=(args,options={})=>{const p=spawnSync('git',args,{encoding:'utf8',windowsHide:true,...options});assert.equal(p.status,0,p.stderr);return p;};
  run(['clone','--shared','--no-checkout','--local',repo,source]);
  run(['-C',source,'-c','core.autocrlf=false','checkout','--detach',authority]);
  const runtime=copyExistingRuntime(repo,provider,source);
  // Explicit local authority, not a fabricated GitHub event or CI approval.
  const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,HOME:process.env.HOME,USERPROFILE:process.env.USERPROFILE,F2_GOV_AUTHORITY_SHA:authority,AUDIT_DIFF_BASE:c.base,PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1'};
  const result=spawnSync(process.execPath,['--test','--test-name-pattern=F2-GOV-06 transition contract exists|F2-01 runtime and engine evidence fail closed|F2-GOV-06 derives readiness|the audited diff cannot mutate','tests/audit/site-audit.test.mjs'],{cwd:source,env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,windowsHide:true});
  fs.writeFileSync(path.join(out,'audit.log'),(result.stdout||'')+(result.stderr||''),{flag:'wx'});
  const receipt={authority,base:c.base,scope:'only four previously failing contracts; not browser coverage or full suite',runtime,exit:result.status,error:result.error?.message??null,signal:result.signal??null};
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {assert.equal(process.argv[2],'audit');const r=audit(...process.argv.slice(3));console.log(JSON.stringify(r,null,2));process.exitCode=r.exit===0&&!r.error&&!r.signal?0:1;}
  catch(e){console.error(e.message);process.exitCode=1;}
}
