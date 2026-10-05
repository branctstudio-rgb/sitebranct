import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import * as runner from './runner.mjs';
const pins=JSON.parse(fs.readFileSync(new URL('source-package.json',import.meta.url)));
const context=()=>({event:'workflow_dispatch',repository:pins.repository,ref:'refs/heads/main',workflowRef:`${pins.repository}/.github/workflows/website-webkit-diagnostic-21.yml@refs/heads/main`,attempt:'1',runId:'123',sha:'a'.repeat(40),wrapperSha:'a'.repeat(40),authorizationId:'WEBSITE-WEBKIT-21-20260913-99',authorization:`AUTHORIZE WEBSITE-WEBKIT-21-20260913-99 ${'a'.repeat(40)} ${pins.sourceHead} ${pins.packageDigest}`});
test('cleanup failure before metadata still requests a minimum failure envelope',()=>{
 assert.equal(typeof runner.recoverEvidence,'function');const calls=[];
 const r=runner.recoverEvidence(context(),{stopOwned(){calls.push('stop');throw Error('synthetic');},hasEvidence(){throw Error('must not reuse unconfirmed evidence');},collect:r=>calls.push({code:r.code,cleanup:r.cleanup,exitCode:r.exitCode})});
 assert.deepEqual(calls,['stop',{code:'CLEANUP_FAILED',cleanup:'FAILED',exitCode:1}]);assert.equal(r.exitCode,1);
});
test('real regularBytes rejection still writes all four minimal artifacts through final collector',()=>{
 assert.equal(typeof runner.finalizeArtifacts,'function');const root=fs.mkdtempSync(path.join(os.tmpdir(),'webkit-recovery-')),bad=path.join(root,'unexpected-directory');fs.mkdirSync(bad);
 const report={code:'MEASURE_FAILED',exitCode:1,cleanup:'OWNED_CONTAINERS_STOPPED_OR_ABSENT',stages:[]};
 runner.finalizeArtifacts(report,{read:()=>{runner.regularBytes(bad);throw Error('unreachable');},write:(r,data)=>{
  fs.writeFileSync(path.join(root,'metadata.json'),JSON.stringify(r));fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(data.results));fs.writeFileSync(path.join(root,'hashes.json'),JSON.stringify(data.hashes));fs.writeFileSync(path.join(root,'technical.log'),data.technical.join('\n'));
 }});
 assert.equal(report.code,'COLLECTION_FAILED');assert.equal(report.exitCode,1);
 for(const n of ['metadata.json','results.json','hashes.json','technical.log'])assert.ok(fs.statSync(path.join(root,n)).isFile());
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'results.json'))),[]);
});
test('cleanup failure prohibits any potentially live evidence read',()=>{
 assert.equal(typeof runner.finalizeArtifacts,'function');let reads=0,writes=0;const r={code:'CLEANUP_FAILED',exitCode:1,cleanup:'FAILED'};
 runner.finalizeArtifacts(r,{read(){reads++;throw Error('live');},write:(report,data)=>{writes++;assert.equal(report.code,'CLEANUP_FAILED');assert.deepEqual(data,{hashes:[],results:[],technical:[]});}});assert.equal(reads,0);assert.equal(writes,1);
});
test('missing metadata after successful stop writes incomplete envelope, never acceptance',()=>{
 assert.equal(typeof runner.recoverEvidence,'function');const saved=[];const r=runner.recoverEvidence(context(),{stopOwned(){},hasEvidence:()=>false,collect:r=>saved.push(r.code)});
 assert.equal(r.code,'INCOMPLETE_NO_CAMPAIGN_REPORT');assert.equal(r.exitCode,1);assert.deepEqual(saved,['INCOMPLETE_NO_CAMPAIGN_REPORT']);
});
test('existing validated evidence is preserved and never overwritten on normal fallback',()=>{
 assert.equal(typeof runner.recoverEvidence,'function');let writes=0;const r=runner.recoverEvidence(context(),{stopOwned(){},hasEvidence:()=>true,collect(){writes++;}});
 assert.equal(r.code,'EXISTING_SANITIZED_EVIDENCE_PRESERVED');assert.equal(writes,0);
});
test('unwritable evidence sink is explicit collection failure, no fabricated artifact claim',()=>{
 assert.equal(typeof runner.finalizeArtifacts,'function');const r={code:'MEASURE_FAILED',exitCode:1};const saved=runner.finalizeArtifacts(r,{read:()=>({hashes:[],results:[],technical:[]}),write(){throw Error('disk unavailable');}});
 assert.equal(saved,false);assert.equal(r.code,'COLLECTION_FAILED');assert.equal(r.exitCode,1);
});
test('metadata alone is not an existing complete artifact set',()=>{
 assert.equal(typeof runner.existingArtifacts,'function');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'webkit-existing-')),c=context();
 fs.writeFileSync(path.join(dir,'metadata.json'),JSON.stringify({wrapper:c.sha,runId:c.runId}));
 assert.equal(runner.existingArtifacts(dir,c),false);
 fs.writeFileSync(path.join(dir,'results.json'),'[]');fs.writeFileSync(path.join(dir,'hashes.json'),'[]');fs.writeFileSync(path.join(dir,'technical.log'),'\n');
 assert.equal(runner.existingArtifacts(dir,c),true);
 fs.writeFileSync(path.join(dir,'results.json'),'{');assert.throws(()=>runner.existingArtifacts(dir,c));
});
