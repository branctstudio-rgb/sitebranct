import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {classifyRecords} from '../scripts/governance/classify-pr-paths.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base='851c1723119b62193623fa24e67090afd18b39f1';
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();

test('publication includes only recognized offline paths, no live payload or protected gate delta',()=>{
  const changed=[...git('diff','--name-only',base).split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(Boolean);
  assert.ok(changed.length>0);
  const result=classifyRecords(changed.map(p=>({status:'A',path:p})));
  assert.equal(result.accepted,true,JSON.stringify(result));assert.equal(result.deploy,false);
  for(const p of changed)assert.match(p,/^(?:fixtures\/website-base\/|docs\/website-base\/|tests\/website-base[^/]*\.mjs$|\.github\/workflows\/website-base-references\.yml$)/);
  assert.equal(git('diff',base,'--','src','*.html','deploy','package.json','package-lock.json','.github/workflows/deploy.yml','.github/workflows/universal-pr-gate.yml','.github/workflows/gate-integrity-sentinel.yml'), '');
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
