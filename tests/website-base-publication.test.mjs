import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {classifyRecords} from '../scripts/governance/classify-pr-paths.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base='851c1723119b62193623fa24e67090afd18b39f1';
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();

function checkPublicationScope(repo,anchor){
  const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8'}).trim();
  const committed=git('diff','--name-only',anchor,'HEAD').split('\n').filter(Boolean);
  const dirty=[...git('diff','--cached','--name-only').split('\n'),...git('diff','--name-only').split('\n')].filter(Boolean);
  // npm ci rewrites this already-tracked metadata. It is never exempt from
  // the committed diff; only a regular, unstaged modification is setup residue.
  const residue='node_modules/.package-lock.json';
  const ignoreResidue=p=>p===residue&&!committed.includes(p)&&
    git('diff','--cached','--name-only','--',p)===''&&
    /^:100644 100644 [a-f0-9]+ [a-f0-9]+ M\tnode_modules\/\.package-lock\.json$/.test(git('diff','--raw','HEAD','--',p))&&
    fs.lstatSync(path.join(repo,p)).isFile()&&!fs.lstatSync(path.join(repo,p)).isSymbolicLink();
  const changed=[...new Set([...committed,...dirty.filter(p=>!ignoreResidue(p)),...git('ls-files','--others','--exclude-standard').split('\n')].filter(Boolean))];
  assert.ok(changed.length>0);
  const result=classifyRecords(changed.map(p=>({status:'A',path:p})));
  assert.equal(result.accepted,true,JSON.stringify(result));assert.equal(result.deploy,false);
  for(const p of changed)assert.match(p,/^(?:fixtures\/website-base\/|docs\/website-base\/|tests\/website-base[^/]*\.mjs$|\.github\/workflows\/website-base-references\.yml$)/);
  assert.equal(git('diff',anchor,'--','src','*.html','deploy','package.json','package-lock.json','.github/workflows/deploy.yml','.github/workflows/universal-pr-gate.yml','.github/workflows/gate-integrity-sentinel.yml'), '');
}
test('publication includes only recognized offline paths, no live payload or protected gate delta',()=>checkPublicationScope(root,base));

function scopeFixture(){
  const repo=fs.mkdtempSync(path.join(os.tmpdir(),'website35-scope-'));
  const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const put=(p,s)=>{fs.mkdirSync(path.dirname(path.join(repo,p)),{recursive:true});fs.writeFileSync(path.join(repo,p),s);};
  git('init');git('config','user.name','Website35 test');git('config','user.email','website35@example.invalid');git('config','core.autocrlf','false');
  put('node_modules/.package-lock.json','{"lockfileVersion":3}\n');put('src/live.js','baseline\n');
  git('add','.');git('commit','-m','fixture base');const anchor=git('rev-parse','HEAD');
  put('fixtures/website-base/example.json','{"synthetic":true}\n');git('add','.');git('commit','-m','offline candidate');
  return {repo,git,put,anchor};
}
test('npm ci hidden-lock residue is not a committed candidate path (CI failure 35911768046)',()=>{
  const f=scopeFixture();f.put('node_modules/.package-lock.json','{"lockfileVersion":3,"packages":{}}\n');
  assert.equal(f.git('diff','--name-only','HEAD'),'node_modules/.package-lock.json');
  assert.doesNotThrow(()=>checkPublicationScope(f.repo,f.anchor));
});
for(const [name,edit] of [
  ['real tracked live edit',f=>f.put('src/live.js','changed\n')],
  ['staged live edit',f=>{f.put('src/live.js','changed\n');f.git('add','src/live.js');}],
  ['staged live edit cancelled only in worktree',f=>{f.put('src/live.js','changed\n');f.git('add','src/live.js');f.put('src/live.js','baseline\n');assert.equal(f.git('diff','--name-only','HEAD'),'');assert.equal(f.git('diff','--cached','--name-only'),'src/live.js');}],
  ['committed live edit',f=>{f.put('src/live.js','changed\n');f.git('add','.');f.git('commit','-m','live delta');}],
  ['committed hidden lock',f=>{f.put('node_modules/.package-lock.json','changed\n');f.git('add','.');f.git('commit','-m','lock delta');}],
  ['staged hidden lock',f=>{f.put('node_modules/.package-lock.json','changed\n');f.git('add','.');}],
  ['staged hidden lock cancelled only in worktree',f=>{f.put('node_modules/.package-lock.json','changed\n');f.git('add','.');f.put('node_modules/.package-lock.json','{"lockfileVersion":3}\n');assert.equal(f.git('diff','--name-only','HEAD'),'');assert.equal(f.git('diff','--cached','--name-only'),'node_modules/.package-lock.json');}],
  ['unexpected untracked source',f=>f.put('unexpected.js','new\n')],
  ['other dependency modification',f=>f.put('node_modules/other.js','new\n')],
  ['hidden lock removed',f=>fs.unlinkSync(path.join(f.repo,'node_modules/.package-lock.json'))]
])test(`publication still rejects ${name}`,()=>{const f=scopeFixture();edit(f);assert.throws(()=>checkPublicationScope(f.repo,f.anchor));});

test('pre-browser diagnostic exists before dependency setup and survives skipped measurement without fabricating evidence',()=>{
  const w=JSON.parse(fs.readFileSync(path.join(root,'.github/workflows/website-base-references.yml')));
  const steps=w.jobs.references.steps,prepare=steps.find(s=>s.id==='evidence'),finalize=steps.find(s=>s.id==='diagnostic');
  assert.ok(prepare,'pre-browser evidence initialization missing');assert.ok(finalize,'diagnostic finalizer missing');
  assert.ok(steps.indexOf(prepare)<steps.findIndex(s=>s.run?.includes('npm ci --ignore-scripts')));
  assert.equal(finalize.if,'${{ always() }}');
  const runInline=(step,env)=>{
    const body=step.run.match(/^node <<'NODE'\n([\s\S]+)\nNODE$/)?.[1];assert.ok(body,'auditable Node heredoc required');
    const result=spawnSync(process.execPath,['-e',body],{env:{...process.env,...env},encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  };
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'website35-evidence-'));
  const env={RUNNER_TEMP:temp,GITHUB_RUN_ID:'42',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),WEBSITE35_HEAD:'b'.repeat(40),WEBSITE35_CONTRACTS:'failure',WEBSITE35_MEASUREMENT:'skipped'};
  runInline(prepare,env);runInline(finalize,env);
  const envelope=path.join(temp,'website-base-42-1'),diag=JSON.parse(fs.readFileSync(path.join(envelope,'job-evidence.json')));
  assert.equal(diag.state,'NOT_VERIFIED');assert.equal(diag.head,'b'.repeat(40));assert.equal(diag.contracts,'failure');assert.equal(diag.measurement,'skipped');
  assert.equal(diag.browserCasesPassed,null);assert.equal(fs.existsSync(path.join(envelope,'measurement')),false);
  assert.ok(fs.existsSync(path.join(envelope,'execution-start.json')));
  assert.match(steps.find(s=>s.id==='contracts').run,/pipefail/);assert.match(steps.find(s=>s.id==='contracts').run,/tee .*contracts\.tap/);
  assert.match(steps.find(s=>s.id==='measurement').run,/\/measurement"$/);
});
test('generator uses a reachable public base and preserves every approved reference resource',async()=>{
  const module=path.join(root,'fixtures/website-base/generate.mjs');
  assert.ok(fs.existsSync(module),'portable reference generator missing');
  const {generate}=await import(pathToFileURL(module));
  const provenance=JSON.parse(fs.readFileSync(path.join(root,'fixtures/website-base/provenance.json')));
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'website35-'));
  for(const id of ['cedro','linha']){
    const config=JSON.parse(fs.readFileSync(path.join(root,`fixtures/website-base/${id}.json`)));
    const m=generate(config,path.join(out,id));assert.equal(m.sourceCommit,base);
    assert.equal(execFileSync('git',['-C',root,'merge-base','--is-ancestor',m.sourceCommit,'HEAD']).length,0);
    assert.equal(m.files.length,11);
    for(const f of m.files)assert.equal(hash(fs.readFileSync(path.join(out,id,f.path))),provenance.referenceResources[id][f.path],id+'/'+f.path);
  }
});
test('one materialized Linux campaign, only PR opened/synchronize, no push/reopen/ready/dispatch',()=>{
  const p=path.join(root,'.github/workflows/website-base-references.yml');assert.ok(fs.existsSync(p),'materialized workflow missing');
  const w=JSON.parse(fs.readFileSync(p));
  assert.deepEqual(Object.keys(w.on),['pull_request']);assert.deepEqual(w.on.pull_request.types,['opened','synchronize']);
  assert.equal(Object.keys(w.jobs).length,1);const j=w.jobs.references;
  assert.equal(j['timeout-minutes'],20);assert.equal(j['runs-on'],'ubuntu-24.04');
  assert.deepEqual(w.permissions,{contents:'read'});assert.equal(j.strategy,undefined);
  const runtime=JSON.parse(fs.readFileSync(path.join(root,'fixtures/audit/f2-01-ci-runtime.json')));
  assert.equal(j.container.image,`mcr.microsoft.com/playwright:${runtime.container.tag}@${runtime.container.indexDigest}`);
  const runs=j.steps.filter(s=>s.run?.startsWith('node fixtures/website-base/verify.mjs '));assert.equal(runs.length,1);
  assert.equal(runs[0].run.includes('--engines='),false,'all three engines required');
  const checkout=j.steps.find(s=>s.uses?.startsWith('actions/checkout@'));assert.equal(checkout.with.ref,'${{ github.event.pull_request.head.sha }}');assert.equal(checkout.with['persist-credentials'],false);
  const artifacts=j.steps.filter(s=>s.uses?.startsWith('actions/upload-artifact@'));assert.equal(artifacts.length,1);assert.equal(artifacts[0].if,'${{ always() }}');
  assert.equal(j.steps.some(s=>s.run?.includes('npm ci --ignore-scripts')),true);
  assert.equal(j.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD,'1');assert.equal(j.env.PLAYWRIGHT_BROWSERS_PATH,'/ms-playwright');
});
test('local event-policy model schedules one campaign for push/open/ready and refuses same-head/rerun duplication',()=>{
  const w=JSON.parse(fs.readFileSync(path.join(root,'.github/workflows/website-base-references.yml')));
  const expression=w.jobs.references.if.slice(3,-2).trim();
  const schedules=(event,action,attempt,before='old')=>Boolean(w.on[event]?.types.includes(action)&&runInNewContext(expression,{github:{run_attempt:attempt,event:{action,before,pull_request:{head:{sha:'new'}}}}}));
  assert.deepEqual([schedules('push','',1),schedules('pull_request','opened',1),schedules('pull_request','ready_for_review',1)],[false,true,false]);
  assert.equal(schedules('pull_request','synchronize',1),true);
  assert.equal(schedules('pull_request','synchronize',1,'new'),false);
  assert.equal(schedules('pull_request','opened',2),false);
  assert.equal(schedules('pull_request','reopened',1),false);
  assert.equal(schedules('workflow_dispatch','',1),false);
});
