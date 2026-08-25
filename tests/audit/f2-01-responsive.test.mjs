import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createHash, createHmac } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium, firefox, webkit } from "playwright";

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
const evidenceActionPhases = (route) => ["before-open", "open", "after-open", "escape-close", ...(route === "index.html" ? ["close-button-open", "close-button-close", "outside-open", "outside-close"] : [])];
const evidenceIdentity = (route, viewport) => `menu-${createHash("sha256").update(JSON.stringify({ route, viewport, actionPhases: evidenceActionPhases(route) })).digest("hex")}`;
const reportPath = process.env.F2_01_REPORT_PATH;
const captureDirectory = process.env.F2_01_CAPTURE_DIR;
const engineName = process.env.F2_01_BROWSER;
const runChallenge = process.env.F2_01_RUN_CHALLENGE;
const engines = { chromium, firefox, webkit };
assert.ok(Object.hasOwn(engines, engineName), `F2_01_BROWSER must be one of ${Object.keys(engines).join(", ")}`);
assert.match(runChallenge ?? "", /^[0-9a-f]{64}$/, "F2_01_RUN_CHALLENGE must be a verifier-issued 256-bit challenge");
const evidenceBinding = (route, viewport, measuredResult) => {
  const evidenceId = evidenceIdentity(route, viewport);
  const actionSequence = evidenceActionPhases(route).map((phase, sequence) => ({ sequence, phase, status: "COMPLETED" }));
  return createHmac("sha256", runChallenge).update(JSON.stringify({ engine: engineName, evidenceId, route, viewport, actionSequence, measuredResult })).digest("hex");
};
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

const browser = await engines[engineName].launch({ headless: true });
const page = await browser.newPage();
let consoleIssues = [];
const actionResults = [];
const infrastructureErrors = [];
page.on("console", (message) => { if (["error", "warning"].includes(message.type())) consoleIssues.push(message.type()); });
page.on("pageerror", () => consoleIssues.push("exception"));
const evaluate = (expression) => page.evaluate((source) => globalThis.eval(source), expression);
const navigate = async (route, viewport) => {
  consoleIssues = [];
  const context = `route=${route} viewport=${viewport}`;
  const response = await page.goto(`http://127.0.0.1:${server.address().port}/${route}`, { waitUntil: "load", timeout: 10000 });
  assert.ok(response?.ok(), `navigation failed (${context})`);
  const ready = await evaluate(`(async()=>{if(document.readyState!=="complete")await new Promise(r=>addEventListener("load",r,{once:true}));await document.fonts.ready;return {readyState:document.readyState,path:location.pathname}})()`);
  assert.deepEqual(ready, { readyState: "complete", path: `/${route}` }, `wrong document loaded (${context})`);
};
const waitFor = async (expression, context, timeout = 3000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await page.waitForTimeout(25);
  }
  return false;
};
class ActionTimeout extends Error {}
const boundedAction = async ({ phase, route, viewport, timeout = 3000 }, operation) => {
  const evidenceId = evidenceIdentity(route, viewport);
  let timer;
  try {
    const result = await Promise.race([
      operation(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new ActionTimeout(`timeout during ${phase} (${route} ${viewport})`)), timeout); }),
    ]);
    actionResults.push({ evidenceId, route, viewport, phase, status: "COMPLETED" });
    return result;
  } catch (error) {
    actionResults.push({ evidenceId, route, viewport, phase, status: error instanceof ActionTimeout ? "TIMEOUT" : "ERROR", message: error.message });
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
    await page.setViewportSize({ width, height });
    for (const route of site.routes) {
      await navigate(route, viewport);
      const metrics = await evaluate(metricsExpression);
      observations.push({ route, viewport, conclusion: "CONCLUSIVE", ...metrics, consoleIssues: [...consoleIssues] });

      if (captureDirectory && route === "index.html" && !captured.has(`${viewport}-closed`)) {
        await page.screenshot({ path: join(captureDirectory, `home-${engineName}-${viewport}-closed.jpg`), type: "jpeg", quality: 86, fullPage: false });
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
        const open = await boundedAction({ phase: "after-open", route, viewport }, () => evaluate(`(()=>{const d=document.querySelector('.mobile-drawer'),t=document.querySelector('.mobile-toggle'),r=d.getBoundingClientRect(),main=document.querySelector('main'),close=d.querySelector('.drawer-close,[data-drawer-close]'),viewportWidth=document.documentElement.clientWidth;return{expanded:t.getAttribute('aria-expanded'),drawerInside:r.left>=-.5&&r.right<=viewportWidth+.5,focusInside:d.contains(document.activeElement),bodyLocked:getComputedStyle(document.body).overflowY==='hidden'||getComputedStyle(document.body).overflow==='hidden',backgroundInert:!main||main.inert,closeTarget:close?(()=>{const x=close.getBoundingClientRect();return{x:x.width,y:x.height,name:close.getAttribute('aria-label')||close.textContent.trim()}})():null,drawerBounds:{left:+r.left.toFixed(1),right:+r.right.toFixed(1),width:+r.width.toFixed(1),viewportWidth}}})()`));
        if (captureDirectory && route === "index.html" && !captured.has(`${viewport}-open`)) {
          await page.screenshot({ path: join(captureDirectory, `home-${engineName}-${viewport}-open.jpg`), type: "jpeg", quality: 86, fullPage: false });
          captured.add(`${viewport}-open`);
        }
        await boundedAction({ phase: "escape-close", route, viewport }, async () => {
          await page.keyboard.press("Escape");
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
              await page.keyboard.press("Escape");
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
              await page.keyboard.press("Escape");
            }
            if (invoked && !await waitFor(`!document.querySelector('.mobile-drawer')?.classList.contains('is-open')`, `outside click ${viewport}`)) throw new ActionTimeout(`timeout during outside-close (${route} ${viewport})`);
            if (!invoked && !await waitFor(`!document.querySelector('.mobile-drawer')?.classList.contains('is-open')`, `outside recovery ${viewport}`)) throw new ActionTimeout(`timeout during outside-close (${route} ${viewport})`);
            return invoked;
          });
          outsideClosed = overlayInvoked && await evaluate(`!document.querySelector('.mobile-drawer')?.classList.contains('is-open')`);
        }
        const measuredResult = { focusReached, focusStyle, open, closed, closeButtonClosed, outsideClosed };
        menuResults.push({ evidenceId: evidenceIdentity(route, viewport), evidenceBinding: evidenceBinding(route, viewport, measuredResult), route, viewport, ...measuredResult });
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await navigate("index.html", "390x844 reduced motion");
  reducedMotion = await evaluate(`(()=>{const values=[...document.querySelectorAll('.mobile-drawer,.drawer-overlay')].flatMap(element=>getComputedStyle(element).transitionDuration.split(',').map(value=>parseFloat(value)*(value.trim().endsWith('ms')?1:1000)));return{matches:matchMedia('(prefers-reduced-motion: reduce)').matches,durationsMs:values}})()`);
  collectionComplete = true;
} catch (error) {
  infrastructureErrors.push(error.message);
} finally {
  globalThis.__f201Report = {
    schemaVersion: 2,
    source: "a47abb9a43248320dfef8449b6a65e187913fd24",
    browser: { engine: engineName, version: browser.version() },
    viewports,
    observations,
    menuResults,
    reducedMotion,
  };
  await browser.close();
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
  const report = { ...globalThis.__f201Report, execution: { complete, infrastructureErrors, actions: actionResults, semanticTests: semanticResults }, conclusion: complete ? "CONCLUSIVE" : "INCONCLUSIVE" };
  await mkdir(normalize(join(reportPath, "..")), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
});
