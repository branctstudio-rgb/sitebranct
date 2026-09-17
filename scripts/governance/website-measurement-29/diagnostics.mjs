// Host-owned diagnostic sidecar. Never imported into the page, never evidence of PASS.
import assert from 'node:assert/strict';
import fs from 'node:fs';
export const stages=['PREPARATION','NAVIGATION','FONTS','OBSERVATION','ACTION','DRAWER_SAMPLE','MENU_MEASURE','REDUCED_MOTION','SEMANTIC','REPORT','CLEANUP'];
export const categories=['NONE','ACTION_DEADLINE','DRAWER_DEADLINE','ASSERTION','OPERATION_ERROR','INCOMPLETE_ACTION','PROCESS_INTERRUPTED'];
export const phases=['before-open','open','after-open','escape-close','close-button-open','close-button-close','outside-open','outside-close'];
const engines=['chromium','firefox','webkit'];
const keys=(x,expected)=>{assert.ok(x&&typeof x==='object'&&!Array.isArray(x),'DIAGNOSTIC_OBJECT');assert.deepEqual(Object.keys(x).sort(),expected.split(' ').sort(),'DIAGNOSTIC_KEYS');};
const count=(n,max)=>assert.ok(Number.isInteger(n)&&n>=0&&n<=max,'DIAGNOSTIC_BOUND');
const enumOf=(x,values)=>assert.ok(values.includes(x),'DIAGNOSTIC_ENUM');
const elapsed=(now,start)=>Math.min(900000,Math.max(0,Math.round(now-start)));
export function validateDiagnostic(v,engine){
 keys(v,'schemaVersion engine stage durationMs finished failure actions shutdown');assert.equal(v.schemaVersion,1);enumOf(engine,engines);assert.equal(v.engine,engine);enumOf(v.stage,stages);count(v.durationMs,900000);assert.equal(typeof v.finished,'boolean');
 if(v.failure!==null){keys(v.failure,'stage category actionIndex');enumOf(v.failure.stage,stages);enumOf(v.failure.category,categories.filter(c=>c!=='NONE'));if(v.failure.actionIndex!==null)count(v.failure.actionIndex,183);}
 keys(v.shutdown,'browser server');for(const x of Object.values(v.shutdown))enumOf(x,['NOT_CONFIRMED','CLOSED']);
 assert.ok(Array.isArray(v.actions)&&v.actions.length<=184,'ACTION_BOUND');
 for(const [index,a]of v.actions.entries()){
  keys(a,'index phase stage status category durationMs samples visible active stable');assert.equal(a.index,index);enumOf(a.phase,phases);enumOf(a.stage,stages);enumOf(a.status,['RUNNING','COMPLETED','TIMEOUT','ERROR']);enumOf(a.category,categories);count(a.durationMs,900000);count(a.samples,10000);
  for(const field of ['visible','active','stable'])assert.ok(a[field]===null||typeof a[field]==='boolean','SAMPLE_BOOLEAN');
  assert.ok(a.status==='COMPLETED'||a.status==='RUNNING'?a.category==='NONE':a.category!=='NONE','ACTION_CATEGORY');
 }
 return v;
}
export function createTrace(engine,sink,clock=()=>performance.now()){
 assert.ok(engines.includes(engine));const start=clock(),tags=new WeakMap(),started=new Map();let active=null;
 const value={schemaVersion:1,engine,stage:'PREPARATION',durationMs:0,finished:false,failure:null,actions:[],shutdown:{browser:'NOT_CONFIRMED',server:'NOT_CONFIRMED'}};
 const snapshot=()=>{value.durationMs=elapsed(clock(),start);return structuredClone(value);};
 const save=()=>sink(validateDiagnostic(snapshot(),engine));
 const classify=e=>tags.get(e)||(e?.code==='ERR_ASSERTION'?'ASSERTION':'OPERATION_ERROR');
 const markFailure=(category,stage,actionIndex)=>{value.failure??={category,stage,actionIndex};};
 const api={snapshot,
  current:()=>active,
  stage(stage,a=null){enumOf(stage,stages);value.stage=stage;if(a&&a.status==='RUNNING')a.stage=stage;save();},
  begin(phase){enumOf(phase,phases);assert.ok(!active&&value.actions.length<184,'ACTION_ORDER');const a={index:value.actions.length,phase,stage:'ACTION',status:'RUNNING',category:'NONE',durationMs:0,samples:0,visible:null,active:null,stable:null};active=a;value.actions.push(a);started.set(a,clock());value.stage='ACTION';save();return a;},
  sample(a,sample,stable){if(!a||a.status!=='RUNNING')return;assert.ok(typeof sample.visible==='boolean'&&typeof sample.active==='boolean');a.samples=Math.min(10000,a.samples+1);a.visible=sample.visible;a.active=sample.active;a.stable=!!stable;},
  tag(error,category){enumOf(category,categories.filter(c=>c!=='NONE'));tags.set(error,category);return error;},
  end(a,status,error){assert.equal(a,active,'ACTION_IDENTITY');a.status=status;a.durationMs=elapsed(clock(),started.get(a));a.category=status==='COMPLETED'?'NONE':classify(error);if(status!=='COMPLETED')markFailure(a.category,a.stage,a.index);active=null;save();},
  failure(error){markFailure(classify(error),value.stage,active?.index??null);save();},
  closed(kind){assert.ok(['browser','server'].includes(kind));value.shutdown[kind]='CLOSED';save();},
  finish(){if(active)markFailure('INCOMPLETE_ACTION',active.stage,active.index);value.finished=true;save();},
 };
 save();return api;
}
export function createFileTrace(){
 const file=process.env.F2_01_REPORT_PATH+'.diagnostic.json';assert.match(file,/^\/outputs\/measurement\/responsive-(chromium|firefox|webkit)\.json\.diagnostic\.json$/);
 const trace=createTrace(process.env.F2_01_BROWSER,v=>{fs.writeFileSync(file+'.tmp',JSON.stringify(v));fs.renameSync(file+'.tmp',file);});
 process.on('uncaughtExceptionMonitor',error=>trace.failure(error));
 process.on('exit',()=>trace.finish());return trace;
}
export function validateDiagnosticAgainstReport(d,r,engine){
 validateDiagnostic(d,engine);assert.equal(d.finished,true,'DIAGNOSTIC_UNFINISHED');assert.equal(d.failure,null,'DIAGNOSTIC_FAILURE');assert.deepEqual(d.shutdown,{browser:'CLOSED',server:'CLOSED'},'SHUTDOWN_NOT_CONFIRMED');
 assert.equal(d.actions.length,184,'DIAGNOSTIC_ACTION_SET');assert.equal(r.execution.actions.length,184);
 for(let n=0;n<184;n++){assert.equal(d.actions[n].phase,r.execution.actions[n].phase);assert.equal(d.actions[n].status,'COMPLETED');assert.equal(d.actions[n].category,'NONE');}
 return true;
}
