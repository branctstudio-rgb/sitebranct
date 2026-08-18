import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

const root = normalize(new URL("../../", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const contract = JSON.parse(await readFile(new URL("../../fixtures/audit/site-contract.json", import.meta.url), "utf8"));
const sizes = { "1440x900":[1440,900], "1024x768":[1024,768], "768x1024":[768,1024], "390x844":[390,844], "360x800":[360,800] };
const mime = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg", ".webp":"image/webp", ".json":"application/json" };

const server = createServer(async (req, res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, "http://local").pathname).replace(/^\/+/, "") || "index.html";
    const file = normalize(join(root, relative));
    assert.ok(file.startsWith(root), "path must remain inside repository");
    assert.ok((await stat(file)).isFile());
    res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));

const candidates = process.platform === "win32"
  ? ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]
  : ["google-chrome", "chromium", "chromium-browser"];
let browser;
for (const executable of candidates) {
  try {
    browser = spawn(executable, ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=0", `--user-data-dir=${join(tmpdir(), `branct-audit-${process.pid}`)}`, "about:blank"], { stdio:["ignore","ignore","pipe"] });
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
let consoleIssues = 0;
ws.onmessage = ({data}) => { const msg=JSON.parse(data); if (msg.method === "Runtime.exceptionThrown" || (msg.method === "Runtime.consoleAPICalled" && ["error","warning"].includes(msg.params.type))) consoleIssues += 1; if (msg.id && pending.has(msg.id)) { const {resolve,reject}=pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); } };
const send = (method, params={}, sessionId) => new Promise((resolve,reject) => { const call=++id; pending.set(call,{resolve,reject}); ws.send(JSON.stringify({id:call,method,params,...(sessionId?{sessionId}:{})})); });
const { targetId } = await send("Target.createTarget", { url:"about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten:true });
await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);

const entries=[];
for (const [viewport,[width,height]] of Object.entries(sizes)) {
  await send("Emulation.setDeviceMetricsOverride", { width,height,deviceScaleFactor:1,mobile:width<600 }, sessionId);
  for (const route of contract.routes) {
    consoleIssues = 0;
    await send("Page.navigate", { url:`http://127.0.0.1:${server.address().port}/${route}` }, sessionId);
    await new Promise((resolve)=>setTimeout(resolve,250));
    const {result}=await send("Runtime.evaluate", { returnByValue:true, expression:`(()=>{const a=[...document.querySelectorAll('a,button,input,select,textarea,[role=button]')];return {route:${JSON.stringify(route)},viewport:${JSON.stringify(viewport)},overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,targetsUnder44:a.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<44||r.height<44)}).length,h1:document.querySelectorAll('h1').length,missingAlt:[...document.images].filter(i=>!i.hasAttribute('alt')).length,hreflang:document.querySelectorAll('link[hreflang]').length}})()` }, sessionId);
    entries.push({ ...result.value, consoleIssues });
  }
}
const output={schemaVersion:1,source:contract.baseSha,browser:await send("Browser.getVersion"),viewports:sizes,method:"CDP collector tests/audit/collect-browser-baseline.mjs",entries};
const serialized=`${JSON.stringify(output,null,2)}\n`;
if (process.argv[2] === "--check") {
  const expected=JSON.parse(await readFile(process.argv[3], "utf8"));
  assert.deepEqual(entries, expected.entries, "recalculated DOM metrics differ from the committed baseline");
} else if (process.argv[2]) await writeFile(process.argv[2], serialized);
else process.stdout.write(serialized);
ws.close(); browser.kill(); server.close();
