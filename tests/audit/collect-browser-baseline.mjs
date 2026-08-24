import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { chromium as playwrightChromium } from "playwright";

const root = normalize(new URL("../../", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const contract = JSON.parse(await readFile(new URL("../../fixtures/audit/site-contract.json", import.meta.url), "utf8"));
const sizes = { "1440x900":[1440,900], "1024x768":[1024,768], "768x1024":[768,1024], "390x844":[390,844], "360x800":[360,800] };
const captureDirectory = process.argv[2] === "--capture" ? process.argv[3] : undefined;
const captures = new Map([
  ["index.html|1440x900", ["home-1440x900.jpg", "home-1440x900-viewport.jpg"]],
  ["index.html|1024x768", ["home-1024x768.jpg"]],
  ["index.html|768x1024", ["home-768x1024.jpg"]],
  ["index.html|390x844", ["home-390x844.jpg", "home-390x844-viewport.jpg"]],
  ["index.html|360x800", ["home-360x800.jpg"]],
  ["crm-gestao.html|1440x900", ["crm-gestao-desktop.jpg"]],
  ["crm-gestao.html|768x1024", ["crm-gestao-tablet.jpg"]],
  ["crm-gestao.html|390x844", ["crm-gestao-mobile.jpg"]],
  ["website-premium.html|1440x900", ["website-premium-desktop.jpg"]],
  ["website-premium.html|768x1024", ["website-premium-tablet.jpg"]],
  ["website-premium.html|390x844", ["website-premium-mobile.jpg"]],
]);
const mime = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg", ".webp":"image/webp", ".json":"application/json" };

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, "http://local");
    const relative = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "") || "index.html";
    const file = normalize(join(root, relative));
    assert.ok(file.startsWith(root), "path must remain inside repository");
    assert.ok((await stat(file)).isFile());
    const auditDelay = Number(requestUrl.searchParams.get("audit-delay") || 0);
    assert.ok(Number.isInteger(auditDelay) && auditDelay >= 0 && auditDelay <= 1000);
    const content = await readFile(file);
    res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
    if (auditDelay && extname(file) === ".html") {
      const bodyOffset = content.indexOf(Buffer.from("<body"));
      assert.ok(bodyOffset > 0, "delayed HTML fixture requires a body element");
      res.write(content.subarray(0, bodyOffset));
      await new Promise((resolve) => setTimeout(resolve, auditDelay));
      res.end(content.subarray(bodyOffset));
    } else res.end(content);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));

const candidates = process.platform === "win32"
  ? [playwrightChromium.executablePath(), "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]
  : [playwrightChromium.executablePath(), "google-chrome", "chromium", "chromium-browser"];
let browser;
for (const executable of candidates) {
  try {
    browser = spawn(executable, ["--headless=new", "--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox", "--remote-debugging-port=0", `--user-data-dir=${join(tmpdir(), `branct-audit-${process.pid}`)}`, "about:blank"], { stdio:["ignore","ignore","pipe"] });
    await new Promise((resolve, reject) => { browser.once("spawn", resolve); browser.once("error", reject); });
    break;
  } catch { browser = undefined; }
}
assert.ok(browser, "Chrome/Chromium is required to reproduce the visual baseline");
let endpoint = "";
for await (const chunk of browser.stderr) {
  const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
  if (match) { endpoint = match[1]; break; }
}
assert.ok(endpoint, "Chrome did not expose a DevTools endpoint");

const ws = new WebSocket(endpoint);
await new Promise((resolve, reject) => { ws.onopen=resolve; ws.onerror=reject; });
let id = 0;
const pending = new Map();
const lifecycleEvents = [];
const lifecycleWaiters = new Set();
let consoleIssues = 0;
ws.onmessage = ({data}) => {
  const msg=JSON.parse(data);
  if (msg.method === "Runtime.exceptionThrown" || (msg.method === "Runtime.consoleAPICalled" && ["error","warning"].includes(msg.params.type))) consoleIssues += 1;
  if (msg.method === "Page.lifecycleEvent") {
    lifecycleEvents.push(msg.params);
    for (const waiter of lifecycleWaiters) {
      if (waiter.loaderId === msg.params.loaderId && waiter.name === msg.params.name) {
        clearTimeout(waiter.timer);
        lifecycleWaiters.delete(waiter);
        waiter.resolve(msg.params);
      }
    }
  }
  if (msg.id && pending.has(msg.id)) { const {resolve,reject}=pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
};
const send = (method, params={}, sessionId) => new Promise((resolve,reject) => { const call=++id; pending.set(call,{resolve,reject}); ws.send(JSON.stringify({id:call,method,params,...(sessionId?{sessionId}:{})})); });
const bounded = (promise, timeout, context) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout after ${timeout}ms while ${context}`)), timeout);
  promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
});
const waitForLifecycle = (loaderId, name, context, timeout=10000) => {
  const existing = lifecycleEvents.find((event) => event.loaderId === loaderId && event.name === name);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const waiter = { loaderId, name, resolve, timer:undefined };
    waiter.timer = setTimeout(() => { lifecycleWaiters.delete(waiter); reject(new Error(`timeout after ${timeout}ms waiting for ${name} (${context})`)); }, timeout);
    lifecycleWaiters.add(waiter);
  });
};
const { targetId } = await send("Target.createTarget", { url:"about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten:true });
await send("Page.enable", {}, sessionId);
await send("Page.setLifecycleEventsEnabled", { enabled:true }, sessionId);
await send("Runtime.enable", {}, sessionId);

const metricsExpression = `(()=>{const a=[...document.querySelectorAll('a,button,input,select,textarea,[role=button]')];return {overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,targetsUnder44:a.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<44||r.height<44)}).length,h1:document.querySelectorAll('h1').length,missingAlt:[...document.images].filter(i=>!i.hasAttribute('alt')).length,hreflang:document.querySelectorAll('link[hreflang]').length}})()`;
const waitForStableMetrics = async (context, timeout=5000) => {
  const deadline = Date.now() + timeout;
  let previous;
  let stableSamples = 0;
  while (Date.now() < deadline) {
    const {result}=await bounded(send("Runtime.evaluate", { returnByValue:true, expression:metricsExpression }, sessionId), timeout, `reading DOM metrics for ${context}`);
    const current = result.value;
    if (JSON.stringify(current) === JSON.stringify(previous)) stableSamples += 1;
    else { previous = current; stableSamples = 1; }
    if (stableSamples >= 3) return current;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timeout after ${timeout}ms waiting for stable DOM metrics (${context})`);
};

const entries=[];
if (captureDirectory) await mkdir(captureDirectory, { recursive:true });
for (const [viewport,[width,height]] of Object.entries(sizes)) {
  await send("Emulation.setDeviceMetricsOverride", { width,height,deviceScaleFactor:1,mobile:width<600 }, sessionId);
  for (const route of contract.routes) {
    const context = `route=${route} viewport=${viewport}`;
    consoleIssues = 0;
    const regressionDelay = viewport === "1440x900" && route === contract.routes[0] ? "?audit-delay=750" : "";
    const navigation = await bounded(send("Page.navigate", { url:`http://127.0.0.1:${server.address().port}/${route}${regressionDelay}` }, sessionId), 10000, `navigating ${context}`);
    assert.ok(navigation.loaderId, `navigation did not create a document loader (${context})`);
    await waitForLifecycle(navigation.loaderId, "load", context);
    const ready = await bounded(send("Runtime.evaluate", { awaitPromise:true, returnByValue:true, expression:`(async()=>{if(document.readyState!=="complete")await new Promise(resolve=>addEventListener("load",resolve,{once:true}));await document.fonts.ready;return {readyState:document.readyState,url:location.pathname}})()` }, sessionId), 10000, `waiting for document and fonts (${context})`);
    assert.deepEqual(ready.result.value, { readyState:"complete", url:`/${route}` }, `wrong document loaded (${context})`);
    const metrics = await waitForStableMetrics(context);
    entries.push({ route, viewport, ...metrics, consoleIssues });
    const requestedCaptures = captures.get(`${route}|${viewport}`);
    if (captureDirectory && requestedCaptures) {
      await send("Runtime.evaluate", { awaitPromise:true, expression:`(async()=>{await document.fonts.ready;for(let y=0;y<document.documentElement.scrollHeight;y+=Math.max(240,innerHeight*.7)){scrollTo(0,y);await new Promise(r=>setTimeout(r,90))}await Promise.race([Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.addEventListener('load',r,{once:true});i.addEventListener('error',r,{once:true})}))),new Promise(r=>setTimeout(r,2500))]);scrollTo(0,0);let s=document.getElementById('audit-capture-style');if(!s){s=document.createElement('style');s.id='audit-capture-style';s.textContent='.reveal,.reveal-stagger,.reveal-stagger>*,.fx-rise,.fx-zoom{opacity:1!important;visibility:visible!important;translate:none!important;scale:1!important;transform:none!important;animation:none!important;transition:none!important}';document.head.appendChild(s)}document.querySelectorAll('.reveal,.reveal-stagger').forEach(e=>e.classList.add('is-visible'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()` }, sessionId);
      const metrics=await send("Page.getLayoutMetrics",{},sessionId);
      for(const file of requestedCaptures){
        const viewportOnly=file.includes("-viewport");
        const clip=viewportOnly
          ? {x:0,y:0,width:metrics.visualViewport.clientWidth,height:metrics.visualViewport.clientHeight,scale:1}
          : {x:0,y:0,width:Math.ceil(metrics.contentSize.width),height:Math.ceil(metrics.contentSize.height),scale:1};
        const shot=await send("Page.captureScreenshot",{format:"jpeg",quality:88,fromSurface:true,captureBeyondViewport:true,clip},sessionId);
        await writeFile(join(captureDirectory,file),Buffer.from(shot.data,"base64"));
      }
    }
  }
}
const output={schemaVersion:1,source:contract.baseSha,browser:await send("Browser.getVersion"),viewports:sizes,method:"CDP collector tests/audit/collect-browser-baseline.mjs",entries};
const serialized=`${JSON.stringify(output,null,2)}\n`;
if (process.argv[2] === "--check") {
  const expected=JSON.parse(await readFile(process.argv[3], "utf8"));
  assert.deepEqual(entries, expected.entries, "recalculated DOM metrics differ from the committed baseline");
} else if (process.argv[2] === "--capture") {
  assert.equal(captures.size, 11);
} else if (process.argv[2]) await writeFile(process.argv[2], serialized);
else process.stdout.write(serialized);
ws.close(); browser.kill(); server.close();
