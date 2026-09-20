// Offline controlled-scheduler tests. They do NOT execute or emulate WebKit.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {instrument,uninstrument} from './instrument.mjs';import {createTrace,validateDiagnostic} from './diagnostics.mjs';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const raw=execFileSync('git',['-C',repo,'show','563f3c13665347b2a8578110e519ebaf13f356e8:tests/audit/f2-01-responsive.test.mjs']);
async function schedule(delays,{active=false,hidden=false,moving=false,missing=false,layoutMs=0,code=instrument(raw).code}={}){
 let now=0,order=0,calls=0,done=false,error;const events=[],cancelled=new Set();
 const later=(fn,ms)=>{const id=++order;events.push({at:now+ms,id,fn});return id;};
 const trace=createTrace('webkit',()=>{},()=>now);
 const drawer={getBoundingClientRect:()=>{now+=layoutMs;return {left:moving?calls:0,right:moving?calls+200:200,top:0,bottom:300,width:200,height:300};},getAnimations:()=>active?[{pending:false,playState:'running'}]:[]};
 const pageRealm=vm.createContext({Promise,performance:{now:()=>now+9000},document:{querySelector:()=>missing?null:drawer,visibilityState:'visible',hasFocus:()=>true},getComputedStyle:()=>({visibility:hidden?'hidden':'visible',display:'flex',opacity:'1'}),requestAnimationFrame:fn=>{const delay=delays[Math.min(calls-1,delays.length-1)];if(Number.isFinite(delay))later(()=>fn(now+9000),delay);}});
 const page={evaluate:fn=>{calls++;return vm.runInContext(`(${fn.toString()})()`,pageRealm);}};
 const context=vm.createContext({assert,Promise,Error,performance:{now:()=>now},diagnostic:trace,setTimeout:later,clearTimeout:id=>cancelled.add(id),evidenceIdentity:()=> 'fixture',actionResults:[]});
 const wait=code.slice(code.indexOf('class ActionTimeout'),code.indexOf('async function verifyDrawerSynchronization'));
 const bounded=code.slice(code.indexOf('const boundedAction ='),code.indexOf('const metricsExpression'));
 vm.runInContext(wait+'\n'+bounded+'\nthis.run=()=>boundedAction({phase:"after-open",route:"index.html",viewport:"320x568"},()=>waitForDrawerSettled(page));',Object.assign(context,{page}));
 context.run().then(()=>{done=true;},e=>{error=e;done=true;});
 for(let rounds=0;rounds<2000&&!done;rounds++){
  for(let n=0;n<30;n++)await Promise.resolve();if(done)break;
  events.sort((a,b)=>a.at-b.at||a.id-b.id);const event=events.shift();assert.ok(event,'scheduler must not fabricate completion');if(cancelled.has(event.id))continue;now=event.at;event.fn();
 }
 assert.ok(done,'offline scheduler exhausted');return {trace:trace.snapshot(),error,calls,now};
}
test('sampling30 separates early pending, late first frame and discarded deadline return',async()=>{
 const early=await schedule([10,Infinity]),late=await schedule([2490,Infinity]),discarded=await schedule([10,2490]);
 for(const r of [early,late,discarded]){assert.match(r.error.message,/2500ms/);assert.equal(r.trace.actions[0].samples,1);assert.equal(r.trace.actions[0].stable,false);assert.equal(r.trace.actions[0].category,'DRAWER_DEADLINE');assert.equal(r.now,2500);}
 const a=early.trace.actions[0].sampling,b=late.trace.actions[0].sampling,c=discarded.trace.actions[0].sampling;
 assert.ok(a&&b&&c,'sampling boundaries missing: accepted sample count is not a frame count');
 assert.equal(a.started,2);assert.equal(a.returned,1);assert.equal(a.pending,1);assert.equal(a.firstReturnMs,10);assert.equal(a.lastStartMs,10);
 assert.equal(b.started,2);assert.equal(b.returned,1);assert.equal(b.firstReturnMs,2490);assert.equal(b.lastRafWaitMs,2490);
 assert.equal(c.started,2);assert.equal(c.returned,2);assert.equal(c.pending,0);assert.equal(c.afterDeadline,1);assert.equal(c.lastReturnMs,2500);
});
test('sampling30 keeps two real frame callbacks, exact source and strict semantic settlement',async()=>{
 const out=instrument(raw);assert.equal(uninstrument(out.code),raw.toString());
 const good=await schedule([10,10]);assert.equal(good.error,undefined);assert.equal(good.calls,2);assert.equal(good.trace.actions[0].samples,2);assert.equal(good.trace.actions[0].sampling.returned,2);assert.equal(good.trace.actions[0].sampling.lastRafWaitMs,10);
 for(const options of [{active:true},{hidden:true},{moving:true},{missing:true}])assert.ok((await schedule([100],options)).error,'unsettled/malformed cannot pass');
 assert.throws(()=>instrument(Buffer.from(raw.toString().replace('2500','2600'))),/CANONICAL_TEST_BYTES/);
});
test('sampling30 rejects inconsistent, missing and unbounded boundary diagnostics',async()=>{
 const r=(await schedule([10,Infinity])).trace;assert.ok(r.actions[0].sampling,'boundary schema missing');validateDiagnostic(r,'webkit');
 for(const mutate of [x=>delete x.actions[0].sampling,x=>x.actions[0].sampling.pending=0,x=>x.actions[0].sampling.returned=3,x=>x.actions[0].sampling.firstReturnMs=-1,x=>x.actions[0].sampling.lastVisibility='PRIVATE',x=>x.actions[0].sampling.lastRafWaitMs=Infinity]){const bad=structuredClone(r);mutate(bad);assert.throws(()=>validateDiagnostic(bad,'webkit'));}
});
test('sampling30 observation hook is load-bearing in LF and CRLF without changing deadline',async()=>{
 for(const eol of ['\n','\r\n']){
  const code=instrument(raw).code.replace(/\r\n|\n/g,eol),mutated=code.replace('diagnostic.observeEvaluation(diagnosticAction,()=>','((a,op)=>op())(diagnosticAction,()=>');
  assert.notEqual(mutated,code,'mutation must change hook');const good=await schedule([10,Infinity],{code}),bad=await schedule([10,Infinity],{code:mutated});
  assert.equal(good.trace.actions[0].sampling.started,2);assert.equal(bad.trace.actions[0].sampling.started,0);assert.equal(good.now,2500);assert.equal(bad.now,2500);assert.equal(bad.trace.actions[0].status,'TIMEOUT');
 }
});

test('sampling30 preserves rejection and freezes diagnostic boundaries at action termination',async()=>{
 let now=0;const trace=createTrace('webkit',()=>{},()=>now),a=trace.begin('after-open');
 const original=new Error('private transport detail');
 await assert.rejects(trace.observeEvaluation(a,()=>Promise.reject(original),2500),e=>e===original);
 assert.equal(a.sampling.rejected,1);assert.equal(a.sampling.pending,0);assert.equal(a.sampling.returned,0);
 let deliver;const pending=trace.observeEvaluation(a,()=>new Promise(resolve=>deliver=resolve),2500);
 now=2500;trace.end(a,'TIMEOUT',trace.tag(new Error(),'DRAWER_DEADLINE'));const frozen=structuredClone(a);
 now=3000;deliver({diagnosticFrame:{rafWaitMs:3000,visibility:'visible',focused:true}});await pending;
 assert.deepEqual(a,frozen);assert.equal(a.sampling.pending,1);validateDiagnostic(trace.snapshot(),'webkit');
 assert.ok(!JSON.stringify(trace.snapshot()).includes('private'));
});

test('sampling30 treats malformed page diagnostic fields as unknown, never as host timing',async()=>{
 let now=0;const trace=createTrace('firefox',()=>{},()=>now),a=trace.begin('after-open');
 const sample={rect:[0,1,0,1],visible:true,active:false,diagnosticFrame:{rafWaitMs:Infinity,visibility:'private text',focused:'TOKEN'}};
 const result=await trace.observeEvaluation(a,()=>{now=25;return sample;},2500);
 assert.equal(result,sample);assert.equal(a.sampling.lastRoundTripMs,25);assert.equal(a.sampling.lastRafWaitMs,null);assert.equal(a.sampling.lastVisibility,null);assert.equal(a.sampling.lastPageFocused,null);
 trace.end(a,'COMPLETED');validateDiagnostic(trace.snapshot(),'firefox');assert.ok(!JSON.stringify(trace.snapshot()).includes('TOKEN'));
});

test('sampling30 callback entry timing excludes synchronous layout cost',async()=>{
 const result=await schedule([10,10],{layoutMs:100});assert.equal(result.error,undefined);
 const s=result.trace.actions[0].sampling;assert.equal(s.returned,2);assert.equal(s.lastRoundTripMs,110);assert.equal(s.lastRafWaitMs,10,'layout cost must not be called rAF scheduling wait');
 for(const eol of ['\n','\r\n']){
  const code=instrument(raw).code.replace(/\r\n|\n/g,eol),mutated=code.replace('rafWaitMs:diagnosticFrameEnd-diagnosticFrameStart','rafWaitMs:performance.now()-diagnosticFrameStart');assert.notEqual(mutated,code);
  const bad=await schedule([10,10],{layoutMs:100,code:mutated});assert.equal(bad.error,undefined);assert.equal(bad.trace.actions[0].sampling.lastRafWaitMs,110);assert.notEqual(bad.trace.actions[0].sampling.lastRafWaitMs,10);
 }
});
