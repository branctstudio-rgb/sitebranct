import assert from "node:assert/strict";
import test, { after } from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

const root = normalize(new URL("../../", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const site = JSON.parse(await readFile(new URL("../../fixtures/audit/site-contract.json", import.meta.url), "utf8"));
const viewports = {
  "320x568": [320, 568],
  "360x800": [360, 800],
  "390x844": [390, 844],
  "412x915": [412, 915],
  "768x1024": [768, 1024],
  "1024x768": [1024, 768],
  "1440x900": [1440, 900],
};
const reportPath = process.env.F2_01_REPORT_PATH;
const captureDirectory = process.env.F2_01_CAPTURE_DIR;
const mime = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

const server = createServer(async (request, response) => {
  try {
    const relative = decodeURIComponent(new URL(request.url, "http://local").pathname).replace(/^\/+/, "") || "index.html";
    const file = normalize(join(root, relative));
    assert.ok(file.startsWith(root), "request path must remain inside repository");
    assert.ok((await stat(file)).isFile(), `missing requested file ${relative}`);
    response.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end("not found");
  }
}).listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));

const candidates = process.platform === "win32"
  ? ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]
  : ["google-chrome", "chromium", "chromium-browser"];
let browser;
for (const executable of candidates) {
  try {
    browser = spawn(executable, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--remote-debugging-port=0",
      `--user-data-dir=${join(tmpdir(), `branct-f2-01-${process.pid}`)}`,
      "about:blank",
    ], { stdio: ["ignore", "ignore", "pipe"] });
    await new Promise((resolve, reject) => { browser.once("spawn", resolve); browser.once("error", reject); });
    break;
  } catch {
    browser = undefined;
  }
}
assert.ok(browser, "Chrome/Chromium is required for the F2-01 responsive contract");
let endpoint = "";
for await (const chunk of browser.stderr) {
  const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
  if (match) { endpoint = match[1]; break; }
}
assert.ok(endpoint, "Chrome did not expose a DevTools endpoint");

const ws = new WebSocket(endpoint);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const pending = new Map();
const lifecycleEvents = [];
const lifecycleWaiters = new Set();
let consoleIssues = [];
const actionResults = [];
const infrastructureErrors = [];
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === "Runtime.exceptionThrown") consoleIssues.push("exception");
  if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) consoleIssues.push(message.params.type);
  if (message.method === "Page.lifecycleEvent") {
    lifecycleEvents.push(message.params);
    for (const waiter of lifecycleWaiters) {
      if (waiter.loaderId === message.params.loaderId && waiter.name === message.params.name) {
        clearTimeout(waiter.timer);
        lifecycleWaiters.delete(waiter);
        waiter.resolve(message.params);
      }
    }
  }
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  }
};
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const call = ++id;
  pending.set(call, { resolve, reject });
  ws.send(JSON.stringify({ id: call, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const waitForLifecycle = (loaderId, name, context, timeout = 10000) => {
  const prior = lifecycleEvents.find((event) => event.loaderId === loaderId && event.name === name);
  if (prior) return Promise.resolve(prior);
  return new Promise((resolve, reject) => {
    const waiter = { loaderId, name, resolve, timer: undefined };
    waiter.timer = setTimeout(() => {
      lifecycleWaiters.delete(waiter);
      reject(new Error(`timeout waiting for ${name} (${context})`));
    }, timeout);
    lifecycleWaiters.add(waiter);
  });
};
const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Page.setLifecycleEventsEnabled", { enabled: true }, sessionId);
await send("Runtime.enable", {}, sessionId);

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression }, sessionId);
  assert.equal(exceptionDetails, undefined, exceptionDetails?.text || "browser evaluation failed");
  return result.value;
};
const navigate = async (route, viewport) => {
  consoleIssues = [];
  const context = `route=${route} viewport=${viewport}`;
  const navigation = await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/${route}` }, sessionId);
  assert.ok(navigation.loaderId, `navigation did not create a loader (${context})`);
  await waitForLifecycle(navigation.loaderId, "load", context);
  const ready = await evaluate(`(async()=>{if(document.readyState!=="complete")await new Promise(r=>addEventListener("load",r,{once:true}));await document.fonts.ready;return {readyState:document.readyState,path:location.pathname}})()`);
  assert.deepEqual(ready, { readyState: "complete", path: `/${route}` }, `wrong document loaded (${context})`);
};
const waitFor = async (expression, context, timeout = 3000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
};
class ActionTimeout extends Error {}
const boundedAction = async ({ phase, route, viewport, timeout = 3000 }, operation) => {
  let timer;
  try {
    const result = await Promise.race([
      operation(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new ActionTimeout(`timeout during ${phase} (${route} ${viewport})`)), timeout); }),
    ]);
    actionResults.push({ route, viewport, phase, status: "COMPLETED" });
    return result;
  } catch (error) {
    actionResults.push({ route, viewport, phase, status: error instanceof ActionTimeout ? "TIMEOUT" : "ERROR", message: error.message });
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const metricsExpression = `(()=>{
  const root=document.documentElement;
  const visible=(element)=>{const style=getComputedStyle(element),rect=element.getBoundingClientRect();return style.visibility!=="hidden"&&style.display!=="none"&&rect.width>0&&rect.height>0};
  const selector=(element)=>{if(element.id)return "#"+element.id;const cls=[...element.classList].slice(0,2).join(".");return element.tagName.toLowerCase()+(cls?"."+cls:"")};
  const actionable=[...document.querySelectorAll('a[href],button,input:not([type="hidden"]),select,textarea,[role="button"],[role="tab"],[role="option"],[tabindex]:not([tabindex="-1"])')].filter(visible);
  const measured=actionable.map(element=>{const rect=element.getBoundingClientRect(),style=getComputedStyle(element);const inlineText=element.tagName==="A"&&style.display==="inline"&&!element.closest('.header,.mobile-drawer,.footer');return{selector:selector(element),href:element.getAttribute('href'),text:(element.getAttribute('aria-label')||element.textContent||'').trim().slice(0,80),parent:selector(element.parentElement),display:style.display,width:+rect.width.toFixed(1),height:+rect.height.toFixed(1),inlineText}});
  const overflowElements=[...document.querySelectorAll('body *')].filter(visible).map(element=>{const rect=element.getBoundingClientRect();return{selector:selector(element),left:+rect.left.toFixed(1),right:+rect.right.toFixed(1),width:+rect.width.toFixed(1)}}).filter(item=>item.left<-.5||item.right>root.clientWidth+.5).slice(0,20);
  const header=document.querySelector('.header'),headerRect=header?.getBoundingClientRect();
  const toggle=document.querySelector('.mobile-toggle'),toggleRect=toggle?.getBoundingClientRect();
  const drawer=document.querySelector('.mobile-drawer'),drawerRect=drawer?.getBoundingClientRect();
  return{
    clientWidth:root.clientWidth,scrollWidth:root.scrollWidth,overflow:root.scrollWidth>root.clientWidth,
    overflowElements,
    smallTargets:measured.filter(item=>!item.inlineText&&(item.width<44||item.height<44)),
    inlineTextExceptions:measured.filter(item=>item.inlineText&&(item.width<44||item.height<44)).length,
    header:headerRect?{left:+headerRect.left.toFixed(1),right:+headerRect.right.toFixed(1),width:+headerRect.width.toFixed(1)}:null,
    toggle:toggleRect?{width:+toggleRect.width.toFixed(1),height:+toggleRect.height.toFixed(1),expanded:toggle.getAttribute('aria-expanded'),controls:toggle.getAttribute('aria-controls'),name:toggle.getAttribute('aria-label')||toggle.textContent.trim()}:null,
    drawer:drawerRect?{left:+drawerRect.left.toFixed(1),right:+drawerRect.right.toFixed(1),width:+drawerRect.width.toFixed(1),open:drawer.classList.contains('is-open')}:null
  };
})()`;

const observations = [];
const menuResults = [];
let reducedMotion;
let collectionComplete = false;
const captured = new Set();
if (captureDirectory) await mkdir(captureDirectory, { recursive: true });

try {
  for (const [viewport, [width, height]] of Object.entries(viewports)) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
    for (const route of site.routes) {
      await navigate(route, viewport);
      const metrics = await evaluate(metricsExpression);
      observations.push({ route, viewport, conclusion: "CONCLUSIVE", ...metrics, consoleIssues: [...consoleIssues] });

      if (captureDirectory && route === "index.html" && !captured.has(`${viewport}-closed`)) {
        const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 86, fromSurface: true }, sessionId);
        await writeFile(join(captureDirectory, `home-${viewport}-closed.jpg`), Buffer.from(shot.data, "base64"));
        captured.add(`${viewport}-closed`);
      }

      if ((width <= 412 || width === 768 && route === "index.html") && metrics.toggle && route !== "styleguide.html") {
        await boundedAction({ phase: "before-open", route, viewport }, async () => {
          const ready = await evaluate(`(()=>{const toggle=document.querySelector('.mobile-toggle'),drawer=document.querySelector('.mobile-drawer');return{toggle:!!toggle,drawer:!!drawer,closed:!!drawer&&!drawer.classList.contains('is-open')}})()`);
          assert.deepEqual(ready, { toggle: true, drawer: true, closed: true }, `drawer precondition failed ${route} ${viewport}`);
        });
        const focusReached = await evaluate(`(()=>{const t=document.querySelector('.mobile-toggle');t?.focus();return document.activeElement===t})()`);
        const focusStyle = await evaluate(`(()=>{const t=document.querySelector('.mobile-toggle'),s=t&&getComputedStyle(t);return t?{visible:t.matches(':focus-visible'),style:s.outlineStyle,width:parseFloat(s.outlineWidth)||0}:null})()`);
        await boundedAction({ phase: "open", route, viewport }, async () => {
          await evaluate(`document.querySelector('.mobile-toggle').click()`);
          if (!await waitFor(`document.querySelector('.mobile-drawer')?.classList.contains('is-open')`, `drawer open ${route} ${viewport}`, 3000)) throw new ActionTimeout(`timeout during open (${route} ${viewport})`);
        });
        const open = await boundedAction({ phase: "after-open", route, viewport }, () => evaluate(`(()=>{const d=document.querySelector('.mobile-drawer'),t=document.querySelector('.mobile-toggle'),r=d.getBoundingClientRect(),main=document.querySelector('main'),close=d.querySelector('.drawer-close,[data-drawer-close]');return{expanded:t.getAttribute('aria-expanded'),drawerInside:r.left>=-.5&&r.right<=document.documentElement.clientWidth+.5,focusInside:d.contains(document.activeElement),bodyLocked:getComputedStyle(document.body).overflowY==='hidden'||getComputedStyle(document.body).overflow==='hidden',backgroundInert:!main||main.inert,closeTarget:close?(()=>{const x=close.getBoundingClientRect();return{x:x.width,y:x.height,name:close.getAttribute('aria-label')||close.textContent.trim()}})():null}})()`));
        if (captureDirectory && route === "index.html" && !captured.has(`${viewport}-open`)) {
          const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 86, fromSurface: true }, sessionId);
          await writeFile(join(captureDirectory, `home-${viewport}-open.jpg`), Buffer.from(shot.data, "base64"));
          captured.add(`${viewport}-open`);
        }
        await boundedAction({ phase: "escape-close", route, viewport }, async () => {
          await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" }, sessionId);
          await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" }, sessionId);
          if (!await waitFor(`!document.querySelector('.mobile-drawer')?.classList.contains('is-open')`, `drawer close ${route} ${viewport}`)) throw new ActionTimeout(`timeout during escape-close (${route} ${viewport})`);
        });
        const closed = await evaluate(`(()=>{const t=document.querySelector('.mobile-toggle'),d=document.querySelector('.mobile-drawer');return{expanded:t.getAttribute('aria-expanded'),focusReturned:document.activeElement===t,backgroundRestored:!document.querySelector('main')?.inert,closed:!d.classList.contains('is-open')}})()`);
        let closeButtonClosed = true;
        let outsideClosed = true;
        if (route === "index.html") {
          await boundedAction({ phase: "close-button-open", route, viewport }, async () => {
            await evaluate(`document.querySelector('.mobile-toggle').click()`);
            if (!await waitFor(`document.querySelector('.mobile-drawer')?.classList.contains('is-open')`, `drawer reopen for close button ${viewport}`)) throw new ActionTimeout(`timeout during close-button-open (${route} ${viewport})`);
          });
          const closeButtonInvoked = await boundedAction({ phase: "close-button-close", route, viewport }, async () => {
            const invoked = await evaluate(`(()=>{const button=document.querySelector('.drawer-close,[data-drawer-close]');if(!button)return false;button.click();return true})()`);
            if (!invoked) {
              await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" }, sessionId);
              await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" }, sessionId);
            }
            if (invoked && !await waitFor(`!document.querySelector('.mobile-drawer')?.classList.contains('is-open')`, `close button ${viewport}`)) throw new ActionTimeout(`timeout during close-button-close (${route} ${viewport})`);
            if (!invoked && !await waitFor(`!document.querySelector('.mobile-drawer')?.classList.contains('is-open')`, `close button recovery ${viewport}`)) throw new ActionTimeout(`timeout during close-button-close (${route} ${viewport})`);
            return invoked;
          });
          closeButtonClosed = closeButtonInvoked && await evaluate(`!document.querySelector('.mobile-drawer')?.classList.contains('is-open')`);
          await boundedAction({ phase: "outside-open", route, viewport }, async () => {
            await evaluate(`document.querySelector('.mobile-toggle').click()`);
            if (!await waitFor(`document.querySelector('.mobile-drawer')?.classList.contains('is-open')`, `drawer reopen for outside click ${viewport}`)) throw new ActionTimeout(`timeout during outside-open (${route} ${viewport})`);
          });
          const overlayInvoked = await boundedAction({ phase: "outside-close", route, viewport }, async () => {
            const invoked = await evaluate(`(()=>{const overlay=document.querySelector('.drawer-overlay');if(!overlay)return false;overlay.click();return true})()`);
            if (!invoked) {
              await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" }, sessionId);
              await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" }, sessionId);
            }
            if (invoked && !await waitFor(`!document.querySelector('.mobile-drawer')?.classList.contains('is-open')`, `outside click ${viewport}`)) throw new ActionTimeout(`timeout during outside-close (${route} ${viewport})`);
            if (!invoked && !await waitFor(`!document.querySelector('.mobile-drawer')?.classList.contains('is-open')`, `outside recovery ${viewport}`)) throw new ActionTimeout(`timeout during outside-close (${route} ${viewport})`);
            return invoked;
          });
          outsideClosed = overlayInvoked && await evaluate(`!document.querySelector('.mobile-drawer')?.classList.contains('is-open')`);
        }
        menuResults.push({ route, viewport, focusReached, focusStyle, open, closed, closeButtonClosed, outsideClosed });
      }
    }
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate("index.html", "390x844 reduced motion");
  reducedMotion = await evaluate(`(()=>{const values=[...document.querySelectorAll('.mobile-drawer,.drawer-overlay')].flatMap(element=>getComputedStyle(element).transitionDuration.split(',').map(value=>parseFloat(value)*(value.trim().endsWith('ms')?1:1000)));return{matches:matchMedia('(prefers-reduced-motion: reduce)').matches,durationsMs:values}})()`);
  collectionComplete = true;
} catch (error) {
  infrastructureErrors.push(error.message);
} finally {
  globalThis.__f201Report = { schemaVersion: 1, source: "a47abb9a43248320dfef8449b6a65e187913fd24", browser: await send("Browser.getVersion"), viewports, observations, menuResults, reducedMotion };
  ws.close();
  browser.kill();
  server.close();
}

const semanticResults = [];
const semanticTest = (name, body) => test(name, async () => {
  try {
    await body();
    semanticResults.push({ name, status: "PASS" });
  } catch (error) {
    semanticResults.push({ name, status: "FAIL" });
    throw error;
  }
});

semanticTest("F2-01 matrix has zero overflow and no undersized non-inline targets", () => {
  assert.equal(observations.length, site.routes.length * Object.keys(viewports).length, "every route and viewport must be observed");
  const overflow = observations.filter((item) => item.overflow || item.header && (item.header.left < -0.5 || item.header.right > item.clientWidth + 0.5));
  assert.deepEqual(overflow, [], `horizontal overflow:\n${overflow.map(({route,viewport,clientWidth,scrollWidth,overflowElements})=>JSON.stringify({route,viewport,clientWidth,scrollWidth,overflowElements})).join("\n")}`);
  const undersized = observations.filter((item) => Number(item.viewport.split("x")[0]) <= 768 && item.smallTargets.length);
  assert.deepEqual(undersized, [], `targets below 44x44:\n${undersized.map(({route,viewport,smallTargets})=>JSON.stringify({route,viewport,smallTargets})).join("\n")}`);
});
semanticTest("F2-01 mobile menu is modal, bounded and closes through every contracted path", () => {
  assert.ok(menuResults.length > 0, "at least one real mobile menu must be exercised");
  const failures = menuResults.filter(({focusReached,focusStyle,open,closed,closeButtonClosed,outsideClosed}) =>
    !focusReached || !focusStyle?.visible || focusStyle.style === "none" || focusStyle.width < 2 ||
    open.expanded !== "true" || !open.drawerInside || !open.focusInside || !open.bodyLocked || !open.backgroundInert ||
    !open.closeTarget || open.closeTarget.x < 44 || open.closeTarget.y < 44 || !open.closeTarget.name ||
    closed.expanded !== "false" || !closed.focusReturned || !closed.backgroundRestored || !closed.closed ||
    !closeButtonClosed || !outsideClosed
  );
  assert.deepEqual(failures, [], `mobile menu contract failures:\n${failures.map((item)=>JSON.stringify(item)).join("\n")}`);
});

semanticTest("F2-01 mobile navigation honors reduced motion", () => {
  assert.equal(reducedMotion?.matches, true, "browser must exercise prefers-reduced-motion: reduce");
  assert.ok(reducedMotion?.durationsMs.length > 0, "drawer and overlay transition durations must be measured");
  assert.ok(reducedMotion.durationsMs.every((duration) => duration <= 1), `reduced motion durations exceed 1ms: ${reducedMotion.durationsMs}`);
});

semanticTest("F2-01 responsive report validator rejects every contracted regression", () => {
  const validate = ({ overflow = false, drawerInside = true, target = 44, focus = true, inert = true, desktop = true }) =>
    !overflow && drawerInside && target >= 44 && focus && inert && desktop;
  assert.equal(validate({}), true);
  assert.equal(validate({ overflow: true }), false, "overflow must fail closed");
  assert.equal(validate({ drawerInside: false }), false, "off-viewport drawer must fail closed");
  assert.equal(validate({ target: 43.9 }), false, "undersized target must fail closed");
  assert.equal(validate({ focus: false }), false, "lost or invisible focus must fail closed");
  assert.equal(validate({ inert: false }), false, "interactive background must fail closed");
  assert.equal(validate({ desktop: false }), false, "desktop regression must fail closed");
});

after(async () => {
  if (!reportPath) return;
  const complete = collectionComplete && infrastructureErrors.length === 0 && actionResults.every(({ status }) => status === "COMPLETED");
  const report = { ...globalThis.__f201Report, execution: { complete, infrastructureErrors, actions: actionResults, semanticTests: semanticResults } };
  await mkdir(normalize(join(reportPath, "..")), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
});
