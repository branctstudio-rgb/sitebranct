import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { chromium as playwrightChromium } from "playwright";

const root = normalize(new URL("../../", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const reportDirectory = process.argv[2] === "--report" ? normalize(process.argv[3]) : undefined;
const manifest = JSON.parse(await readFile(new URL("../../fixtures/audit/evidence-manifest.json", import.meta.url), "utf8"));
const negativeControl = JSON.parse(await readFile(new URL("../../fixtures/audit/visual-negative-control.json", import.meta.url), "utf8"));
const server = createServer(async (req,res)=>{try{const rel=decodeURIComponent(new URL(req.url,"http://local").pathname).replace(/^\/+/,"");const external=rel.startsWith("report/");const base=external?reportDirectory:root;assert.ok(base);const child=external?rel.slice(7):rel;const file=normalize(join(base,child));assert.ok(file.startsWith(base));assert.ok((await stat(file)).isFile());res.writeHead(200,{"content-type":"image/jpeg","access-control-allow-origin":"*"});res.end(await readFile(file));}catch{res.writeHead(404);res.end();}}).listen(0,"127.0.0.1");
await new Promise(r=>server.once("listening",r));

const candidates=process.platform==="win32"?[playwrightChromium.executablePath(),"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe","C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]:[playwrightChromium.executablePath(),"google-chrome","chromium","chromium-browser"];
let browser;
for(const executable of candidates){try{browser=spawn(executable,["--headless=new","--disable-gpu","--disable-dev-shm-usage","--no-sandbox","--remote-debugging-port=0",`--user-data-dir=${join(tmpdir(),`branct-visual-${process.pid}`)}`,"about:blank"],{stdio:["ignore","ignore","pipe"]});await new Promise((r,j)=>{browser.once("spawn",r);browser.once("error",j)});break;}catch{browser=undefined;}}
assert.ok(browser,"Chrome/Chromium is required");
let endpoint="";for await(const chunk of browser.stderr){const m=chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){endpoint=m[1];break;}}
assert.ok(endpoint);
const ws=new WebSocket(endpoint);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let id=0;const pending=new Map();ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)}};const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const call=++id;pending.set(call,{resolve,reject});ws.send(JSON.stringify({id:call,method,params,...(sessionId?{sessionId}:{})}))});
const {targetId}=await send("Target.createTarget",{url:"about:blank"});const {sessionId}=await send("Target.attachToTarget",{targetId,flatten:true});await send("Runtime.enable",{},sessionId);

const failures=[];
const targets=reportDirectory
  ? manifest.files.map(item=>({file:item.file,path:`report/${item.file}`,expected:"report"}))
  : [...manifest.files.map(item=>({file:item.file,path:`docs/audit/evidence/baseline/${item.file}`,expected:"accept"})),{file:negativeControl.file,path:`fixtures/audit/${negativeControl.file}`,expected:"reject"}];
for(const item of targets){
  const url=`http://127.0.0.1:${server.address().port}/${item.path}`;
  const {result}=await send("Runtime.evaluate",{awaitPromise:true,returnByValue:true,expression:`(async()=>{const b=await fetch(${JSON.stringify(url)}).then(r=>r.blob());const img=await createImageBitmap(b);const bands=160,w=96,c=document.createElement('canvas');c.width=w;c.height=bands;c.getContext('2d').drawImage(img,0,0,w,bands);const d=c.getContext('2d').getImageData(0,0,w,bands).data;let uniform=0,lowDetail=0;for(let y=0;y<bands;y++){let n=0,s=0,s2=0,min=255,max=0,edge=0,prev;for(let x=0;x<w;x++){const i=(y*w+x)*4,l=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];n++;s+=l;s2+=l*l;min=Math.min(min,l);max=Math.max(max,l);if(prev!==undefined)edge+=Math.abs(l-prev);prev=l}const sd=Math.sqrt(s2/n-(s/n)**2);if(sd<4&&max-min<14)uniform++;if(edge/(w-1)<2.2)lowDetail++}return{uniformBandRatio:uniform/bands,lowDetailBandRatio:lowDetail/bands,width:img.width,height:img.height}})()`},sessionId);
  assert.equal(typeof result.value?.uniformBandRatio,"number",`${item.file} must be pixel-decodable`);
  const {uniformBandRatio:uniform,lowDetailBandRatio:lowDetail}=result.value;
  const rejected=uniform>=0.45||(uniform>0.40&&(lowDetail>0.64||lowDetail<0.58));
  console.log(`${item.file}: ${(result.value.uniformBandRatio*100).toFixed(1)}% uniform, ${(result.value.lowDetailBandRatio*100).toFixed(1)}% low-detail, ${rejected?"REJECT":"ACCEPT"}`);
  if(item.expected==="accept"&&rejected) failures.push(`${item.file}: valid evidence rejected`);
  if(item.expected==="reject"&&!rejected) failures.push(`${item.file}: negative control was accepted`);
}
ws.close();browser.kill();server.close();
assert.deepEqual(failures,[],`visual evidence contains mostly uniform/empty vertical bands:\n${failures.join("\n")}`);
