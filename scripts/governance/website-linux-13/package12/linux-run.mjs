// NOT EXECUTED. Exactly one run per case; process-level ceiling is not an assertion timeout.
import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');
assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH,'/ms-playwright');
const head='563f3c13665347b2a8578110e519ebaf13f356e8';
assert.equal(execFileSync('git',['-C','/candidate','rev-parse','HEAD'],{encoding:'utf8'}).trim(),head);
assert.equal(execFileSync('git',['-C','/candidate','status','--porcelain'],{encoding:'utf8'}).trim(),'');
const require=createRequire('/candidate/package.json');assert.equal(require('playwright/package.json').version,'1.62.0');
const lock=JSON.parse(fs.readFileSync('/candidate/package-lock.json'));assert.equal(lock.packages['node_modules/playwright'].version,'1.62.0');
assert.deepEqual(JSON.parse(fs.readFileSync('/candidate/node_modules/playwright-core/browsers.json')).browsers.filter(b=>['chromium','firefox','webkit'].includes(b.name)).map(b=>[b.name,b.revision]),[['chromium','1234'],['firefox','1538'],['webkit','2336']]);
fs.mkdirSync('/outputs/results',{recursive:false});
const results=[];
function run(name,args,extra={},seconds=300){
 const p=spawnSync(process.execPath,args,{cwd:'/candidate',encoding:'utf8',timeout:seconds*1000,maxBuffer:32*1024*1024,env:{PATH:process.env.PATH,HOME:'/tmp',TMPDIR:'/tmp',LANG:'C.UTF-8',PLAYWRIGHT_BROWSERS_PATH:'/ms-playwright',PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',CANDIDATE_ROOT:'/candidate',PROBE_OUTPUT:'/outputs/results',...extra}});
 fs.writeFileSync(`/outputs/results/${name}.log`,(p.stdout||'')+(p.stderr||''));results.push({name,status:p.status??null,signal:p.signal,error:p.error?.message??null});
 fs.writeFileSync('/outputs/results/summary.json',JSON.stringify({head,node:process.version,platform:process.platform,lockSha256:createHash('sha256').update(fs.readFileSync('/candidate/package-lock.json')).digest('hex'),results},null,2)+'\n');
 if(p.error||p.signal||p.status!==0)throw Error(`${name}: unsuccessful or unknown child result; stop, no retry`);
}
run('lexical',['--test','--test-name-pattern=inventories the real branct|WEBSITE-09 inventory|WEBSITE-11 inventory','tests/audit/f2-gov-08.test.mjs']);
run('webkit-webm',['--test','--test-name-pattern=F2-GOV-09-F11 WebKit records browser media variability','tests/audit/f2-gov-08.test.mjs']);
run('causal-chromium',['/package/causal-browser.mjs','chromium']);
run('causal-webkit',['/package/causal-browser.mjs','webkit']);
for(const engine of ['chromium','firefox','webkit'])run(`responsive-${engine}`,['/package/linux-responsive.mjs'],{F2_01_BROWSER:engine,F2_01_REPORT_PATH:`/outputs/results/responsive-${engine}.json`},900);
// No promoting a process exit to complete semantic proof.
for(const engine of ['chromium','firefox','webkit']){
 const report=JSON.parse(fs.readFileSync(`/outputs/results/responsive-${engine}.json`));
 fs.writeFileSync(`/outputs/results/responsive-${engine}-digest.txt`,createHash('sha256').update(JSON.stringify(report)).digest('hex')+'\n');
 assert.equal(report.browser.engine,engine);
 assert.equal(report.execution.complete,true,`${engine}: incomplete is not GREEN`);
 assert.equal(report.execution.infrastructureErrors.length,0);
 assert.equal(report.observations.length,84);assert.equal(report.menuResults.length,41);assert.equal(report.execution.actions.length,184);
 assert.equal(report.execution.semanticTests.length,4);assert.ok(report.execution.semanticTests.every(t=>t.status==='PASS'));
}
process.exitCode=results.every(r=>r.status===0)?0:1;
