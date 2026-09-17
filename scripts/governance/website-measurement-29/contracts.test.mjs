import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {pathToFileURL} from 'node:url';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {projectDiagnostic as oldProject} from '../website-measurement-28/runner.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../..');
const d=await import('./diagnostics.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const i=await import('./instrument.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const source=()=>execFileSync('git',['-C',repo,'show','563f3c13665347b2a8578110e519ebaf13f356e8:tests/audit/f2-01-responsive.test.mjs']);

test('RED28: sanitized statuses cannot distinguish inner drawer and outer action timeout',()=>{
 const r=message=>({observations:[{}],menuResults:[],execution:{complete:false,infrastructureErrors:[message],actions:[{status:'COMPLETED'},{status:'COMPLETED'},{phase:'after-open',status:'TIMEOUT',message}]}});
 assert.deepEqual(oldProject(r('drawer did not settle within 2500ms'),'webkit'),oldProject(r('timeout during after-open'),'webkit'));
 assert.equal(typeof d.createTrace,'function','missing trusted stage/category producer');
});
test('trace preserves first failure across cleanup and semantics; outputs only closed fields',()=>{
 assert.equal(typeof d.createTrace,'function');let now=0,saved;
 const t=d.createTrace('webkit',x=>saved=x,()=>now);
 t.stage('NAVIGATION');t.stage('FONTS');t.stage('OBSERVATION');
 const a=t.begin('after-open');t.stage('DRAWER_SAMPLE',a);now=2100;t.sample(a,{visible:false,active:true},false);
 const error=t.tag(new Error('TOKEN_PRIVATE_URL_HTML'),'DRAWER_DEADLINE');t.end(a,'TIMEOUT',error);t.failure(error);t.stage('CLEANUP');t.closed('browser');t.closed('server');t.finish();
 assert.equal(saved.failure.category,'DRAWER_DEADLINE');assert.equal(saved.failure.stage,'DRAWER_SAMPLE');assert.equal(saved.actions[0].durationMs,2100);assert.equal(saved.actions[0].samples,1);assert.equal(saved.actions[0].active,true);assert.equal(saved.actions[0].visible,false);
 assert.ok(!JSON.stringify(saved).includes('TOKEN'));assert.equal(saved.shutdown.browser,'CLOSED');assert.doesNotThrow(()=>d.validateDiagnostic(saved,'webkit'));
});
test('missing/unknown/truncated/oversized/secret diagnostics cannot appear complete',()=>{
 assert.equal(typeof d.validateDiagnostic,'function');const t=d.createTrace('chromium',()=>{},()=>0),good=t.snapshot();
 for(const bad of [null,{}, {...good,engine:'secret'}, {...good,extra:'TOKEN'}, {...good,actions:Array(185).fill({})}, {...good,durationMs:Infinity}, {...good,stage:'RAW_MESSAGE'}])assert.throws(()=>d.validateDiagnostic(bad,'chromium'));
 assert.throws(()=>d.validateDiagnostic(JSON.parse(JSON.stringify(good).slice(0,-1)),'chromium'));
});
test('canonical test is instrumented only from exact Git bytes; corrupted source fails closed',()=>{
 assert.equal(typeof i.instrument,'function');const raw=source(),out=i.instrument(raw);
 assert.ok(out.code.includes('diagnostic.begin(phase)'));assert.ok(out.code.includes('diagnostic.sample'));
 assert.equal(out.sourceSha256,'9606d616d3dc132235453e93a7b8a4d4f41953e03803a7382f8aee9f81409118');
 assert.throws(()=>i.instrument(Buffer.from(raw.toString().replace('2500','2600'))));
 assert.equal(i.uninstrument(out.code),raw.toString(),'instrumentation must remove to exact original semantics');
});

// Execute the real transformed functions. Only the external page and scheduler are
// substituted; no browser, server, container or old measurement driver is started.
async function functionsFor(mode){
 const code=i.instrument(source()).code;let clock=0,timers=[],saved;
 const trace=d.createTrace('webkit',x=>saved=x,()=>clock);
 const context={assert,diagnostic:trace,performance:{now:()=>clock},Date,Promise,Error,
   evidenceIdentity:()=> 'fixture',actionResults:[],
   setTimeout:(fn,ms)=>{const timer={fn,ms};timers.push(timer);if(mode==='hang')queueMicrotask(()=>{clock+=ms;fn();});return timer;},clearTimeout:()=>{},
 };
 vm.createContext(context);
 const wait=code.slice(code.indexOf('class ActionTimeout'),code.indexOf('async function verifyDrawerSynchronization'));
 const bounded=code.slice(code.indexOf('const boundedAction ='),code.indexOf('const metricsExpression'));
 vm.runInContext(wait+'\n'+bounded+'\nthis.wait=waitForDrawerSettled;this.bound=boundedAction;',context);
 let n=0;const page={evaluate:async()=>{n++;if(mode==='hang')return new Promise(()=>{});clock+=mode==='active'?1300:10;return {rect:[0,200,0,300],visible:true,active:mode==='active'};}};
 return {context,page,trace,read:()=>saved,timers};
}
test('real canonical functions discriminate settlement deadline and outer deadline without increasing either',async()=>{
 assert.equal(typeof i.instrument,'function');
 const x=await functionsFor('active');await assert.rejects(x.context.bound({phase:'after-open',route:'index.html',viewport:'320x568'},()=>x.context.wait(x.page)));
 assert.equal(x.read().actions[0].category,'DRAWER_DEADLINE');assert.ok(x.timers.some(t=>t.ms===3000));
 const y=await functionsFor('hang');await assert.rejects(y.context.bound({phase:'after-open',route:'index.html',viewport:'320x568'},()=>new Promise(()=>{})));
 assert.equal(y.read().actions[0].category,'ACTION_DEADLINE');
 const z=await functionsFor('stable');await z.context.bound({phase:'after-open',route:'index.html',viewport:'320x568'},()=>z.context.wait(z.page));assert.equal(z.read().actions[0].status,'COMPLETED');assert.equal(z.read().actions[0].samples,2);
});
test('before/during/after action errors and absent completion stay failures, never diagnostic PASS',()=>{
 assert.equal(typeof d.createTrace,'function');
 for(const stage of ['PREPARATION','NAVIGATION','FONTS','MENU_MEASURE','REPORT','CLEANUP']){
  const t=d.createTrace('firefox',()=>{},()=>1);t.stage(stage);t.failure(new Error('private'));t.finish();const v=t.snapshot();assert.equal(v.failure.stage,stage);assert.notEqual(v.failure.category,'NONE');assert.equal(v.finished,true);
 }
 const t=d.createTrace('webkit',()=>{},()=>0);t.begin('open');t.finish();assert.equal(t.snapshot().failure.category,'INCOMPLETE_ACTION');
});
test('actual post-settlement measurement timeout is separately staged, never attributed to animation',async()=>{
 const x=await functionsFor('stable');const result=x.context.bound({phase:'after-open',route:'index.html',viewport:'320x568'},async()=>{await x.context.wait(x.page);x.trace.stage('MENU_MEASURE',x.trace.current());return new Promise(()=>{});});
 for(let n=0;n<20;n++)await Promise.resolve();assert.equal(x.read().actions[0].stage,'MENU_MEASURE');x.timers.find(t=>t.ms===3000).fn();await assert.rejects(result);
 assert.equal(x.read().failure.category,'ACTION_DEADLINE');assert.equal(x.read().failure.stage,'MENU_MEASURE');
});
test('diagnostic integrity and failure rejection mutations are load-bearing in LF and CRLF',async()=>{
 const code=fs.readFileSync(path.join(here,'diagnostics.mjs'),'utf8');
 for(const eol of ['\n','\r\n'])for(const [needle,replacement,exercise]of [
  ["enumOf(v.failure.category,categories.filter(c=>c!=='NONE'));",'',module=>{const t=d.createTrace('webkit',()=>{},()=>0);t.failure(new Error());const v=t.snapshot();v.failure.category='SECRET_SENTINEL';return ()=>module.validateDiagnostic(v,'webkit');}],
  ["assert.equal(d.finished,true,'DIAGNOSTIC_UNFINISHED');",'',module=>{const t=d.createTrace('webkit',()=>{},()=>0);for(let j=0;j<184;j++)t.end(t.begin('open'),'COMPLETED');t.closed('browser');t.closed('server');return ()=>module.validateDiagnosticAgainstReport(t.snapshot(),{execution:{actions:Array(184).fill({phase:'open'})}},'webkit');}],
 ]){
  const raw=code.replace(/\r?\n/g,eol);assert.equal(raw.split(needle).length,2);const changed=raw.replace(needle,replacement);assert.notEqual(changed,raw);const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'website29-mutation-')),'diagnostics.mjs');fs.writeFileSync(file,changed);const mutant=await import(pathToFileURL(file));assert.throws(exercise(d));assert.doesNotThrow(exercise(mutant));
 }
});
