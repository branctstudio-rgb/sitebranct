import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workflow=()=>JSON.parse(fs.readFileSync(path.join(root,'.github/workflows/website-base-references.yml')));
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'website40-'));
const put=(root,name,bytes)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);};
const git=(repo,...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const projectPaths=[
  'fixtures/website-project/branct.json','fixtures/website-project/preview.mjs',
  'fixtures/website-project/project.mjs','fixtures/website-project/start-preview.ps1',
  'fixtures/website-project/stop-preview.ps1','tests/website-project-browser.mjs','tests/website-project.test.mjs'
];
// Model only the positive path patterns used by this workflow, not all Actions syntax.
const matches=(name,pattern)=>new RegExp('^'+pattern.split('**').map(part=>part.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^/]*')).join('.*')+'$').test(name);
for(const name of projectPaths)test(`project CI selects a change only to ${name}`,()=>{
  assert.ok(workflow().on.pull_request.paths.some(p=>matches(name,p)),`no campaign for ${name}`);
});
test('project CI extension is exact, not another project-wide wildcard',()=>{
  const added=workflow().on.pull_request.paths.filter(p=>p.includes('website-project'));
  assert.deepEqual([...added].sort(),[...projectPaths].sort());
  for(const name of ['fixtures/website-project/extra.json','tests/website-project-other.mjs','src/live.js'])
    assert.equal(workflow().on.pull_request.paths.some(p=>matches(name,p)),false,name);
});

function runContracts(w,failProject){
  const f=temp(),log=path.join(f,'website-base-40-1');fs.mkdirSync(log);
  for(const name of ['website-base-generator.test.mjs','website-base-verification.test.mjs','website-base-publication.test.mjs','website-base-project-ci.test.mjs','website-project.test.mjs'])
    put(f,'tests/'+name,`import test from 'node:test';import assert from 'node:assert/strict';test('${name}',()=>assert.equal(${name==='website-project.test.mjs'&&failProject?'1':'0'},0));\n`);
  const step=w.jobs.references.steps.find(s=>s.id==='contracts');
  assert.equal(step.shell,'bash');assert.equal(step['continue-on-error'],undefined);
  const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
  const env={...process.env,RUNNER_TEMP:f.replaceAll('\\','/'),GITHUB_RUN_ID:'40',GITHUB_RUN_ATTEMPT:'1'};
  delete env.NODE_TEST_CONTEXT; // A separate runner, not recursive test discovery.
  const result=spawnSync(bash,['--noprofile','--norc','-c',step.run],{cwd:f,encoding:'utf8',env});
  assert.equal(result.error,undefined);
  return {...result,tap:fs.readFileSync(path.join(log,'contracts.tap'),'utf8')};
}
test('project CI invokes both project and CI regressions and propagates a real failing test through tee',()=>{
  const w=workflow(),green=runContracts(w,false);assert.equal(green.status,0,green.stderr);
  assert.match(green.tap,/website-project\.test\.mjs/);assert.match(green.tap,/website-base-project-ci\.test\.mjs/);
  const red=runContracts(w,true);assert.notEqual(red.status,0);assert.match(red.tap,/not ok .*website-project\.test\.mjs/);
});
test('project CI mutation: removing pipefail hides the deliberately failing project test',()=>{
  const w=workflow(),step=w.jobs.references.steps.find(s=>s.id==='contracts');
  const red=runContracts(w,true);assert.notEqual(red.status,0);
  const before=step.run;step.run=before.replace('set -euo pipefail','set -eu');assert.notEqual(step.run,before);
  const escaped=runContracts(w,true);assert.equal(escaped.status,0);assert.match(escaped.tap,/not ok .*website-project\.test\.mjs/);
});
test('project CI wires a mandatory Git receiver before the single unchanged browser campaign',()=>{
  const w=workflow(),steps=w.jobs.references.steps,s=steps.find(s=>s.id==='project-receiver');
  assert.ok(s,'Git-only receiver is not scheduled');assert.equal(s.if,undefined);assert.equal(s['continue-on-error'],undefined);
  assert.equal(s.env.WEBSITE_PROJECT_HEAD,'${{ github.event.pull_request.head.sha }}');
  assert.equal(s.run,'node fixtures/website-base/verify-project-receiver.mjs "$GITHUB_WORKSPACE" "$WEBSITE_PROJECT_HEAD" "$RUNNER_TEMP/website-base-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/project-receiver"');
  assert.ok(steps.indexOf(s)>steps.findIndex(s=>s.id==='contracts'));assert.ok(steps.indexOf(s)<steps.findIndex(s=>s.id==='measurement'));
  assert.equal(steps.filter(s=>s.run?.includes('fixtures/website-base/verify.mjs ')).length,1);
  assert.equal(steps.some(s=>s.run?.includes('node tests/website-project-browser.mjs')),false,'no second browser campaign');
});

const sourcePaths=[
  'fixtures/website-project/project.mjs','fixtures/website-project/branct.json',
  'fixtures/website-base/site.css','fixtures/website-base/navigation.js',
  'CLAUDE.md','website-premium.html','src/i18n/pt.json','index.html','src/img/icon.svg','src/img/website-940.webp',
  'src/fonts/font-faces.css','src/fonts/manrope-latin.woff2','src/fonts/manrope-latin-ext.woff2',
  'src/fonts/bricolage-grotesque-latin.woff2','src/fonts/bricolage-grotesque-latin-ext.woff2'
];
function receiverFixture(){
  const repo=temp();git(repo,'init');git(repo,'config','user.name','Website40 test');git(repo,'config','user.email','website40@example.invalid');git(repo,'config','core.autocrlf','false');
  for(const name of sourcePaths)put(repo,name,execFileSync('git',['-C',root,'show',`HEAD:${name}`],{maxBuffer:8*1024*1024}));
  put(repo,'node_modules/private.js','throw Error("must never be transported");');
  git(repo,'add','.');git(repo,'commit','-m','Git-only project fixture');return {repo,head:git(repo,'rev-parse','HEAD')};
}
function runReceiver(f,head=f.head){
  const helper=path.join(root,'fixtures/website-base/verify-project-receiver.mjs');assert.ok(fs.existsSync(helper),'Git-only reconstruction command missing');
  const runner=temp(),parent=path.join(runner,'website-base-40-1');fs.mkdirSync(parent);
  const output=path.join(parent,'project-receiver');
  const step=workflow().jobs.references.steps.find(s=>s.id==='project-receiver');assert.ok(step);
  const env={...process.env,GITHUB_ACTIONS:'false',GIT_NO_LAZY_FETCH:'1',GITHUB_WORKSPACE:f.repo.replaceAll('\\','/'),WEBSITE_PROJECT_HEAD:head,RUNNER_TEMP:runner.replaceAll('\\','/'),GITHUB_RUN_ID:'40',GITHUB_RUN_ATTEMPT:'1'};
  const result=spawnSync(process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash',['--noprofile','--norc','-c',step.run],{cwd:root,encoding:'utf8',env});
  return {...result,output};
}
test('Git receiver uses committed bytes despite dirty/private files and records 14 verified resources without dependencies',()=>{
  const f=receiverFixture();put(f.repo,'fixtures/website-project/project.mjs','throw Error("dirty checkout must not run");');put(f.repo,'private.txt','not committed');
  const r=runReceiver(f);assert.equal(r.status,0,r.stderr);
  const receipt=JSON.parse(fs.readFileSync(path.join(r.output,'receipt.json')));
  assert.equal(receipt.head,f.head);assert.equal(receipt.state,'PASS');assert.equal(receipt.files,14);
  assert.equal(receipt.platform,process.platform);assert.equal(receipt.executionContext,'LOCAL');
  assert.deepEqual(receipt.commands.map(c=>[c.operation,c.status]),[['create',0],['verify',0]]);
  const receiver=path.join(r.output,'receiver');assert.equal(fs.existsSync(path.join(receiver,'.git')),false);assert.equal(fs.existsSync(path.join(receiver,'node_modules')),false);assert.equal(fs.existsSync(path.join(receiver,'private.txt')),false);
  assert.deepEqual(receipt.sources.map(s=>s.path).sort(),[...sourcePaths].sort());
  for(const s of receipt.sources)assert.equal(s.blob,git(f.repo,'rev-parse',`${f.head}:${s.path}`));
});
test('Git receiver rejects head drift rather than labelling the wrong revision as proved',()=>{
  const f=receiverFixture();put(f.repo,'extra.txt','later');git(f.repo,'add','.');git(f.repo,'commit','-m','later');
  const r=runReceiver(f);assert.notEqual(r.status,0);assert.match(r.stderr,/head mismatch/);
});
for(const mode of ['missing','nonregular','broken-generator'])test(`Git receiver fails closed for ${mode}`,()=>{
  const f=receiverFixture();
  if(mode==='missing')git(f.repo,'rm','--','src/img/website-940.webp');
  if(mode==='nonregular')git(f.repo,'update-index','--chmod=+x','fixtures/website-project/project.mjs');
  if(mode==='broken-generator'){put(f.repo,'fixtures/website-project/project.mjs','throw Error("broken generator");');git(f.repo,'add','.');}
  git(f.repo,'commit','-m',mode);f.head=git(f.repo,'rev-parse','HEAD');
  const r=runReceiver(f);assert.notEqual(r.status,0);
  assert.match(r.stderr,mode==='missing'?/missing Git input/:mode==='nonregular'?/regular Git blob/:/create failed/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(r.output,'receipt.json'))).state,'FAIL');
});
