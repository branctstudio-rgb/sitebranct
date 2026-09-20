// Closed, additive instrumentation of the exact Git blob563. No candidate code
// chooses diagnostic categories. Removing marked insertions yields exact source.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
export const sourceSha256='9606d616d3dc132235453e93a7b8a4d4f41953e03803a7382f8aee9f81409118';
const mark=code=>`/*D29*/${code}/*END29*/`;
export const uninstrument=code=>code.replace(/\/\*D29\*\/[\s\S]*?\/\*END29\*\//g,'');
export function instrument(bytes){
 assert.equal(sha(bytes),sourceSha256,'CANONICAL_TEST_BYTES');let code=bytes.toString('utf8');
 const insert=(needle,addition,where='after',expected=1)=>{
  assert.equal(code.split(needle).length-1,expected,'INSTRUMENT_ANCHOR');
  code=code.split(needle).join(where==='after'?needle+mark(addition):mark(addition)+needle);
 };
 code=mark('import {createFileTrace} from "/control/website-measurement-29/diagnostics.mjs"; const diagnostic=createFileTrace();\n')+code;
 insert('  const response = await page.goto','diagnostic.stage("NAVIGATION");\n','before');
 insert('  const ready = await evaluate(`(async()=>','diagnostic.stage("FONTS");\n','before');
 insert('  const deadline = performance.now() + 2500;','\n  const diagnosticAction=diagnostic.current(); diagnostic.stage("DRAWER_SAMPLE",diagnosticAction);');
 // Host boundaries are observed before the canonical deadline-discard branch.
 // Page timing is supplementary diagnostic data, never settlement/PASS authority.
 insert('targetPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {','diagnostic.observeEvaluation(diagnosticAction,()=>','before');
 insert('targetPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {','const diagnosticFrameEnd=performance.now();');
 insert('      })))',',deadline)');
 insert('new Promise(resolve => ','{const diagnosticFrameStart=performance.now();');
 const frameClose='      })))';assert.equal(code.split(frameClose).length-1,1,'FRAME_CLOSE_ANCHOR');code=code.replace(frameClose,'      })'+mark(';}')+'))');
 insert('        resolve({','\n          diagnosticFrame:{rafWaitMs:diagnosticFrameEnd-diagnosticFrameStart,visibility:document.visibilityState,focused:document.hasFocus()},');
 insert('    if (sample.visible && !sample.active && stable) return;','diagnostic.sample(diagnosticAction,sample,stable);\n','before');
 // Wrap, rather than replace, each existing Error. Deadline and rejection unchanged.
 const wrap=(needle,category,expected)=>{insert(needle,'diagnostic.tag(','before',expected);insert(needle,`,"${category}")`,'after',expected);};
 wrap("new ActionTimeout('drawer did not settle within 2500ms')",'DRAWER_DEADLINE',2);
 wrap('new ActionTimeout(`timeout during ${phase} (${route} ${viewport})`)','ACTION_DEADLINE',1);
 insert('  const evidenceId = evidenceIdentity(route, viewport);','\n  const diagnosticAction=diagnostic.begin(phase);');
 insert('    actionResults.push({ evidenceId, route, viewport, phase, status: "COMPLETED" });','\n    diagnostic.end(diagnosticAction,"COMPLETED");');
 insert('    actionResults.push({ evidenceId, route, viewport, phase, status: error instanceof ActionTimeout ? "TIMEOUT" : "ERROR", message: error.message });','\n    diagnostic.end(diagnosticAction,error instanceof ActionTimeout?"TIMEOUT":"ERROR",error);');
 insert('      const metrics = await evaluate(metricsExpression);','diagnostic.stage("OBSERVATION");\n','before');
 insert('          await waitForDrawerSettled(page);','\n          diagnostic.stage("MENU_MEASURE",diagnostic.current());');
 insert('  await page.emulateMedia({ reducedMotion: "reduce" });','diagnostic.stage("REDUCED_MOTION");\n','before');
 insert('  infrastructureErrors.push(error.message);','\n  diagnostic.failure(error);');
 insert('  await browser.close();','diagnostic.stage("CLEANUP");\n','before');
 insert('  await browser.close();','\n  diagnostic.closed("browser"); server.once("close",()=>diagnostic.closed("server"));');
 insert('const semanticTest = (name, body) => test(name, async () => {','\n  diagnostic.stage("SEMANTIC");');
 insert('    semanticResults.push({ name, status: "FAIL" });','\n    diagnostic.failure(error);');
 insert('  if (!reportPath) return;','\n  diagnostic.stage("REPORT");');
 assert.equal(uninstrument(code),bytes.toString('utf8'),'ADDITIVE_ONLY');
 return {code,sourceSha256,executedSha256:sha(code),schemaVersion:1};
}
