// All inputs below are synthetic schema fixtures, not recovered execution19 raw data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const selected=process.env.PROJECTOR_FILE||new URL('./runner.mjs',import.meta.url).pathname.replace(/^\/(.:)/,'$1');
const {projectJson}=await import(pathToFileURL(path.resolve(selected)));
const phaseNames=['before-open','open','after-open','escape-close','close-button-open','close-button-close','outside-open','outside-close'];
const report=(status='ERROR',phase='after-open')=>({schemaVersion:2,browser:{engine:'webkit',version:'26.5'},observations:[{}],menuResults:[],execution:{complete:false,actions:[{phase:'before-open',status:'COMPLETED'},{phase:'open',status:'COMPLETED'},{phase,status,message:'SYNTHETIC_PRIVATE_MESSAGE',route:'PRIVATE_ROUTE',viewport:'320x568',evidenceId:'PRIVATE_ID'}],infrastructureErrors:['SYNTHETIC_PRIVATE_MESSAGE'],semanticTests:['FAIL','FAIL','FAIL','PASS'].map(status=>({status}))}});
const project=o=>projectJson('responsive-webkit.json',JSON.stringify(o));
test('last recorded phase is retained on failure, and absent information stays UNKNOWN',()=>{
 assert.equal(project(report('TIMEOUT','after-open')).lastRecordedActionPhase,'after-open');
 const r=report();r.execution.actions=[];assert.equal(project(r).lastRecordedActionPhase,'UNKNOWN');
});
test('driver failure projection retains only closed code stage signal and process error',()=>{
 const p=projectJson('summary.json',JSON.stringify({head:'563f3c13665347b2a8578110e519ebaf13f356e8',code:'CHILD_FAILED',stage:'RESPONSIVE_WEBKIT',exitCode:1,results:[{name:'responsive-webkit',status:null,error:'PROCESS_TIMEOUT',signal:'SIGTERM'}]}));
 assert.deepEqual(p.driver,{code:'CHILD_FAILED',stage:'RESPONSIVE_WEBKIT',exitCode:1});
 assert.equal(p.results[0].processError,'PROCESS_TIMEOUT');assert.equal(p.results[0].processSignal,'SIGTERM');
 const bad=projectJson('summary.json',JSON.stringify({code:'private',stage:'private',exitCode:'private',results:[{name:'responsive-webkit',error:'private',signal:'private'}]}));
 assert.deepEqual(bad.driver,{code:'UNKNOWN',stage:'UNKNOWN',exitCode:null});assert.ok(!JSON.stringify(bad).includes('private'));
});
test('representative action error keeps its structured phase/category instead of only its count',()=>{
 const p=project(report());assert.equal(p.complete,false);assert.equal(p.actions,3);assert.equal(p.infrastructureErrors,1);
 assert.deepEqual(p.diagnostics,{schemaVersion:1,purpose:'DIAGNOSTIC_NOT_ACCEPTANCE',status:'FAILURE_RECORDED',infrastructureErrorDetail:'UNKNOWN',actionOutcomes:[
  {ordinal:1,phase:'before-open',status:'COMPLETED',errorCategory:'NONE_RECORDED'},
  {ordinal:2,phase:'open',status:'COMPLETED',errorCategory:'NONE_RECORDED'},
  {ordinal:3,phase:'after-open',status:'ERROR',errorCategory:'ACTION_ERROR_UNSPECIFIED'}]});
});
test('typed action TIMEOUT is distinct from ERROR without inspecting message text',()=>{
 const a=project(report('TIMEOUT')),b=project(report('ERROR'));
 assert.equal(a.diagnostics.actionOutcomes[2].errorCategory,'ACTION_TIMEOUT');
 assert.equal(b.diagnostics.actionOutcomes[2].errorCategory,'ACTION_ERROR_UNSPECIFIED');
 assert.equal(a.complete,false);assert.equal(b.complete,false);
});
for(const phase of phaseNames)test(`preserves the closed phase ${phase}`,()=>assert.equal(project(report('ERROR',phase)).diagnostics.actionOutcomes[2].phase,phase));
test('free messages/URLs/HTML/stacks/identity and attacker-provided classification never survive projection',()=>{
 const r=report();const bait='PRIVATE_HTTPS_HTML_STACK_CONTACT';
 Object.assign(r.execution.actions[2],{message:bait,stack:bait,url:bait,phase:bait,status:bait,errorCategory:bait,route:bait});
 r.execution.infrastructureErrors=[bait];r.diagnostics={status:'PASS',errorCategory:bait};
 const p=project(r);assert.equal(p.diagnostics.status,'UNKNOWN');
 assert.deepEqual(p.diagnostics.actionOutcomes[2],{ordinal:3,phase:'UNKNOWN',status:'UNKNOWN',errorCategory:'UNKNOWN'});
 assert.ok(!JSON.stringify(p).includes(bait));assert.ok(!JSON.stringify(p).includes('PRIVATE_'));
});
for(const actions of [undefined,null,{},[null],Array.from({length:185},()=>({phase:'open',status:'COMPLETED'}))])test(`missing/malformed/oversized actions remain UNKNOWN (${JSON.stringify(actions)?.length??0})`,()=>{
 const r=report();r.execution.actions=actions;const p=project(r);assert.equal(p.diagnostics.status,'UNKNOWN');assert.equal(p.complete,false);
});
test('missing error detail cannot be inferred from free text saying timeout or media',()=>{
 for(const message of ['TimeoutError','MEDIA_ERR_DECODE','drawer did not settle within 2500ms','']){
  const r=report();r.execution.actions=[];r.execution.infrastructureErrors=[message];
  const p=project(r);assert.equal(p.diagnostics.status,'UNKNOWN');assert.equal(p.diagnostics.infrastructureErrorDetail,'UNKNOWN');
  assert.equal(p.complete,false);assert.deepEqual(p.diagnostics.actionOutcomes,[]);
 }
});
test('missing infrastructure array is UNKNOWN even when actions look completed',()=>{
 const r=report('COMPLETED');r.execution.complete=true;delete r.execution.infrastructureErrors;
 assert.equal(project(r).diagnostics.status,'UNKNOWN');
});
test('nominal completed input is descriptive, never a new acceptance decision',()=>{
 const r=report('COMPLETED');r.execution.complete=true;r.execution.infrastructureErrors=[];
 const d=project(r).diagnostics;assert.equal(d.status,'NO_FAILURE_RECORDED');assert.equal(d.purpose,'DIAGNOSTIC_NOT_ACCEPTANCE');assert.equal(d.infrastructureErrorDetail,'NONE_RECORDED');
});
test('complete flag cannot hide a recorded action failure in diagnostics',()=>{
 const r=report('TIMEOUT');r.execution.complete=true;assert.equal(project(r).diagnostics.status,'FAILURE_RECORDED');
});
test('already-sanitized historical projection cannot reconstruct lost diagnostics',()=>{
 const p=project({complete:false,observations:1,menus:0,actions:3,infrastructureErrors:1});
 assert.equal(p.diagnostics.status,'UNKNOWN');assert.equal(p.diagnostics.actionOutcomes,null);assert.equal(p.complete,false);
});
test('malformed JSON is rejected, not transformed into an apparent successful report',()=>assert.throws(()=>projectJson('responsive-webkit.json','{"execution":'),SyntaxError));
test('synthetic structured media error stays distinct in the existing causal projector',()=>{
 const media={readyState:0,networkState:3,error:3,duration:null,documentReady:'complete'};
 const raw={playwright:'1.62.0',records:['newPage','newContext.newPage'].map(context=>({engine:'webkit',version:'26.5',options:{headless:true},context,deadline:30000,result:'INCONCLUSIVE',error:'PRIVATE_MESSAGE',loadCompleted:false,media}))};
 const p=projectJson('causal-webkit.json',JSON.stringify(raw));assert.equal(p.records[0].media.error,3);assert.equal(p.records[0].result,'INCONCLUSIVE');assert.ok(!JSON.stringify(p).includes('PRIVATE_MESSAGE'));
 assert.equal(project(report('ERROR')).diagnostics.actionOutcomes[2].errorCategory,'ACTION_ERROR_UNSPECIFIED');
});
test('isolation schema stays unchanged and does not inherit responsive diagnostics',()=>{
 assert.deepEqual(projectJson('responsive-webkit.json.isolation.json','{"attempts":[],"violations":[]}'),{complete:false,observations:null,menus:null,actions:null,infrastructureErrors:null,semanticStatuses:null,externalAttempts:0,violations:0,recordCount:null});
});
test('same report projection for LF CRLF CR mixed EOL and final newline variants',()=>{
 const raw=JSON.stringify(report('TIMEOUT'),null,2),want=project(report('TIMEOUT'));
 for(const body of [raw,raw+'\n',raw.replaceAll('\n','\r\n'),raw.replaceAll('\n','\r\n')+'\r\n',raw.replaceAll('\n','\r'),raw.replace(/\n/g,(_,i)=>i%2?'\r\n':'\n')])assert.deepEqual(projectJson('responsive-webkit.json',body),want);
});
